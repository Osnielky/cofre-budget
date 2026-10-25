import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Project } from '../projects/project.entity';
import { Category } from '../categories/category.entity';
import { categoriesForKind, defaultTransferKind, isTransferKind, transferKindOptions, TRANSFER_CATEGORY_DEFAULTS, type TransferKind } from './transfer-kind';
import { DebtsService } from '../debts/debts.service';
import { isLiabilityType } from '../bank-accounts/account-types';
import { CategorizationRulesService } from '../categorization-rules/categorization-rules.service';

/** One piece of a split. Exactly one of categoryId / projectCategoryId may be
    set; a projectCategoryId must be accompanied by its projectId. */
export interface SplitPiece {
  categoryId?: string | null;
  projectId?: string | null;
  projectCategoryId?: string | null;
  amount: number;
}

export interface CsvRow {
  date: string;        // MM/DD/YYYY or YYYY-MM-DD
  referenceNumber?: string;
  name: string;
  amount: number;
}

/**
 * Sources the user is allowed to delete a row from.
 *
 * Plaid is excluded on purpose: those rows are owned by the bank feed and the
 * next sync would bring a deleted one straight back, so offering delete would
 * be a lie.
 *
 * Deleting a `recurring` row removes that one occurrence only — the rule
 * survives and keeps producing future months. Nothing re-creates the deleted
 * row because RecurringService.materialiseDue skips every date at or before
 * `lastRunDate`, which is a high-water mark rather than a per-row record.
 * `runCount` is deliberately left alone: a deleted occurrence means "this one
 * did not happen", so a count-limited series keeps its original schedule
 * instead of growing a replacement month on the end.
 */
const DELETABLE_SOURCES = new Set(['manual', 'recurring', 'csv']);

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction) private repo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(ProjectCategory) private projCatRepo: Repository<ProjectCategory>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    private debtsService: DebtsService,
    private rulesService: CategorizationRulesService,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
  ) {}

  async getCategoryHints(userId: string): Promise<Record<string, { id: string; name: string; icon: string; color: string }>> {
    const txs = await this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.categoryId IS NOT NULL')
      .andWhere('categoryRef.type != :t', { t: 'transfer' })
      .orderBy('tx.date', 'DESC')
      .limit(300)
      .getMany();

    const normalize = (n: string) => n.replace(/\s+(?:conf#\S+|[A-Z0-9]{6,})$/i, '').trim();

    const hints: Record<string, { id: string; name: string; icon: string; color: string }> = {};
    for (const tx of txs) {
      if (!tx.categoryRef) continue;
      const { id, name, icon, color } = tx.categoryRef;
      // Store under exact name AND normalized name so both lookups hit
      if (!hints[tx.name]) hints[tx.name] = { id, name, icon, color };
      const norm = normalize(tx.name);
      if (norm && !hints[norm]) hints[norm] = { id, name, icon, color };
    }
    return hints;
  }

  async getProjectHints(userId: string): Promise<Record<string, { projectId: string; projectCategoryId: string; catName: string; catIcon: string; catColor: string }>> {
    // Single JOIN query — no N+1 loop
    const txs = await this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.projectCategoryRef', 'cat')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.projectId IS NOT NULL')
      .andWhere('tx.projectCategoryId IS NOT NULL')
      .orderBy('tx.date', 'DESC')
      .limit(500)
      .getMany();

    const normalize = (n: string) => n.replace(/\s+(?:conf#\S+|[A-Z0-9]{6,})$/i, '').trim();
    const hints: Record<string, { projectId: string; projectCategoryId: string; catName: string; catIcon: string; catColor: string }> = {};

    for (const tx of txs) {
      const cat = (tx as any).projectCategoryRef;
      if (!cat) continue;
      const entry = { projectId: tx.projectId, projectCategoryId: tx.projectCategoryId, catName: cat.name, catIcon: cat.icon, catColor: cat.color };
      if (!hints[tx.name]) hints[tx.name] = entry;
      const norm = normalize(tx.name);
      if (norm && !hints[norm]) hints[norm] = entry;
    }
    return hints;
  }

  findByUser(
    userId: string,
    bankAccountId?: string,
    from?: string,
    to?: string,
    limit = 500,
  ): Promise<Transaction[]> {
    const qb = this.repo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      // A project-categorised row has categoryId = null by design, so without
      // this join the client cannot tell it apart from a genuinely
      // uncategorised one and reports it as "Uncategorized".
      .leftJoinAndSelect('tx.projectCategoryRef', 'projectCategoryRef')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.transferAccount', 'transferAccount')
      .leftJoinAndSelect('tx.categorizedByRule', 'categorizedByRule')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.isSplitParent = false')
      .orderBy('tx.date', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .limit(limit);

    if (bankAccountId) qb.andWhere('tx.bankAccountId = :bankAccountId', { bankAccountId });
    if (from) qb.andWhere('tx.date >= :from', { from });
    if (to)   qb.andWhere('tx.date <= :to', { to });
    return qb.getMany();
  }

  countThisMonth(userId: string): Promise<number> {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return this.repo.count({
      where: { userId, date: Between(from, to) },
    });
  }

  async checkDuplicates(
    userId: string, bankAccountId: string, rows: CsvRow[],
  ): Promise<{
    newCount: number; duplicateCount: number; duplicateExternalIds: string[];
    /* Duplicates that live outside this account (another account, or orphaned by
       a deleted one). importCsv skips them too, so the preview must count them —
       otherwise a row shows as "new" on every import while never being saved. */
    elsewhereCount: number; elsewhereAccounts: string[];
  }> {
    const account = await this.accountRepo.findOneBy({ id: bankAccountId });
    if (!account || account.userId !== userId) throw new ForbiddenException();

    /* Candidate keys per row — the same three forms importCsv matches on. */
    const keysOf = (row: CsvRow) => {
      const ref = row.referenceNumber?.trim();
      const amt2 = Number(row.amount).toFixed(2);           // "10.00"
      const amtRaw = String(row.amount);                    // "10" (old format, no toFixed)
      return {
        ref: ref ? `csv_${ref}` : null,
        key2: `csv_${row.date}|${row.name}|${amt2}`,
        keyOld: `csv_${row.date}|${row.name}|${amtRaw}`,
      };
    };

    /* 1–3. externalId lookup, USER-wide — any account, any source — because that
       is what importCsv checks (and what the unique index on userId+externalId
       enforces). Done in batches to keep the IN list bounded. */
    const allKeys = [...new Set(rows.flatMap((r) => { const k = keysOf(r); return [k.ref, k.key2, k.keyOld].filter((x): x is string => !!x); }))];
    const owner = new Map<string, string | null>(); // externalId → bankAccountId (null = orphan)
    for (let i = 0; i < allKeys.length; i += 2000) {
      const hits = await this.repo.find({
        where: { userId, externalId: In(allKeys.slice(i, i + 2000)) },
        select: ['externalId', 'bankAccountId'],
      });
      for (const h of hits) owner.set(h.externalId, h.bankAccountId ?? null);
    }

    /* 4. Field match within this account (any source, like importCsv) — catches
       rows stored without an externalId. */
    const existing = await this.repo.find({
      where: { bankAccountId, userId },
      select: ['id', 'date', 'amount', 'name'],
    });

    const duplicateExternalIds: string[] = [];
    const elsewhereAccountIds = new Set<string | null>();
    let elsewhereCount = 0;

    const noteHit = (key: string) => {
      duplicateExternalIds.push(key);
      const acct = owner.get(key);
      if (acct !== bankAccountId) { elsewhereCount++; elsewhereAccountIds.add(acct ?? null); }
    };

    for (const row of rows) {
      const k = keysOf(row);
      if (k.ref && owner.has(k.ref)) { noteHit(k.ref); continue; }
      if (owner.has(k.key2))         { noteHit(k.key2); continue; }
      if (owner.has(k.keyOld))       { noteHit(k.keyOld); continue; }

      const match = existing.find((t) =>
        t.date === row.date &&
        t.name === row.name &&
        Math.abs(Number(t.amount) - Number(row.amount)) < 0.005,
      );
      if (match) duplicateExternalIds.push(k.key2);
    }

    /* Name the other accounts so the UI can say where the rows already live. */
    const otherIds = [...elsewhereAccountIds].filter((id): id is string => !!id);
    const others = otherIds.length ? await this.accountRepo.find({ where: { id: In(otherIds), userId }, select: ['id', 'bankName', 'accountName'] }) : [];
    const elsewhereAccounts = others.map((a) => `${a.bankName} — ${a.accountName}`);
    if (elsewhereAccountIds.has(null)) elsewhereAccounts.push('a deleted account');

    return {
      newCount: rows.length - duplicateExternalIds.length,
      duplicateCount: duplicateExternalIds.length,
      duplicateExternalIds,
      elsewhereCount,
      elsewhereAccounts,
    };
  }

  async importCsv(userId: string, bankAccountId: string, rows: CsvRow[], finalBalance?: number): Promise<{ imported: number; skipped: number; balanceUpdated?: boolean }> {
    const account = await this.accountRepo.findOneBy({ id: bankAccountId });
    if (!account || account.userId !== userId) throw new ForbiddenException();

    let imported = 0;
    let skipped = 0;
    const rules = await this.rulesService.getActiveRules(userId);

    for (const row of rows) {
      const externalId = row.referenceNumber ? `csv_${row.referenceNumber}` : null;

      if (externalId) {
        const exists = await this.repo.findOneBy({ externalId, userId });
        if (exists) { skipped++; continue; }
      }

      /* Fallback: match by account + date + amount + name for rows without externalId in DB */
      const fieldMatch = await this.repo
        .createQueryBuilder('tx')
        .where('tx.bankAccountId = :bankAccountId', { bankAccountId })
        .andWhere('tx.date = :date', { date: normalizeDate(row.date) })
        .andWhere('CAST(tx.amount AS DECIMAL(12,2)) = :amount', { amount: Number(row.amount).toFixed(2) })
        .andWhere('tx.name = :name', { name: row.name })
        .getOne();
      if (fieldMatch) { skipped++; continue; }

      const matchedRule = this.rulesService.matchRule(rules, { name: row.name });
      await this.repo.save(
        this.repo.create({
          userId,
          bankAccountId,
          externalId: externalId ?? undefined,
          source: 'csv',
          amount: row.amount,
          name: row.name,
          date: normalizeDate(row.date),
          pending: false,
          categoryId: matchedRule?.categoryId ?? undefined,
          categorizedByRuleId: matchedRule?.id ?? undefined,
        }),
      );
      imported++;
    }

    let balanceUpdated = false;

    if (finalBalance !== undefined && !isNaN(finalBalance)) {
      // CSV had an explicit balance column (e.g. BofA checking "Running Bal.").
      // Apply regardless of how many rows were new so re-importing refreshes the
      // balance, and chunked imports still update even if the final chunk is all
      // duplicates (the balance only rides on the last chunk).
      account.balance = finalBalance;
      await this.accountRepo.save(account);
      balanceUpdated = true;
    } else if (imported > 0 && isLiabilityType(account.accountType)) {
      // Liability accounts: recalculate balance as total amount owed from all transactions
      const raw = await this.repo
        .createQueryBuilder('tx')
        .select('COALESCE(SUM(tx.amount), 0)', 'total')
        .where('tx.bankAccountId = :bankAccountId', { bankAccountId })
        .getRawOne<{ total: string }>();
      const total = parseFloat(raw?.total ?? '0');
      // Expenses are negative, payments are positive → owed = -total
      account.balance = parseFloat((-total).toFixed(2));
      await this.accountRepo.save(account);
      balanceUpdated = true;
    }

    return { imported, skipped, balanceUpdated };
  }

  async createManual(userId: string, dto: {
    name: string; amount: number; date: string;
    bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null;
    note?: string | null;
    projectId?: string | null; projectCategoryId?: string | null;
  }): Promise<Transaction> {
    if (dto.bankAccountId) {
      const account = await this.accountRepo.findOneBy({ id: dto.bankAccountId });
      if (!account || account.userId !== userId) throw new ForbiddenException();
    }
    // A row is either budget-categorised or project-categorised, never both —
    // otherwise it is counted by a regular budget and a project budget at once.
    if (dto.categoryId && dto.projectCategoryId) {
      throw new BadRequestException('A transaction cannot have both a category and a project category');
    }
    if (dto.projectCategoryId && !dto.projectId) {
      throw new BadRequestException('A project category requires its project');
    }
    await this.assertOwnsProjectRefs(userId, [{ amount: dto.amount, projectId: dto.projectId, projectCategoryId: dto.projectCategoryId }]);
    if (dto.debtId && !(Math.abs(dto.amount) > 0)) throw new BadRequestException('A debt repayment amount must be non-zero.');

    const matchedRule = dto.debtId || dto.categoryId
      ? null
      : this.rulesService.matchRule(await this.rulesService.getActiveRules(userId), { name: dto.name });

    const saved = await this.repo.save(
      this.repo.create({
        userId,
        bankAccountId: dto.bankAccountId ?? undefined,
        source: 'manual',
        amount: dto.amount,
        name: dto.name,
        date: dto.date,
        pending: false,
        note: dto.note ?? null,
        categoryId: dto.debtId || dto.projectCategoryId ? undefined : (dto.categoryId ?? matchedRule?.categoryId ?? undefined),
        categorizedByRuleId: dto.debtId || dto.categoryId || dto.projectCategoryId ? undefined : (matchedRule?.id ?? undefined),
        debtId: dto.debtId ?? undefined,
        projectId: dto.projectId ?? undefined,
        projectCategoryId: dto.projectCategoryId ?? undefined,
      }),
    );
    if (dto.debtId) {
      try {
        await this.debtsService.recordPaymentFromTransaction(dto.debtId, userId, { amount: Math.abs(dto.amount), date: dto.date, transactionId: saved.id });
      } catch (e) {
        await this.repo.remove(saved); // don't leave an orphaned tx if the debt was invalid
        throw e;
      }
    }
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'bankAccount', 'projectCategoryRef'] });
  }

  async updateManual(id: string, userId: string, dto: {
    name?: string; amount?: number; date?: string; bankAccountId?: string | null; note?: string | null;
  }): Promise<Transaction> {
    const tx = await this.repo.findOneBy({ id, userId });
    if (!tx) throw new NotFoundException();
    if (tx.source !== 'manual') throw new BadRequestException('Only manual transactions can be edited');
    if (dto.bankAccountId !== undefined) {
      if (dto.bankAccountId) {
        const account = await this.accountRepo.findOneBy({ id: dto.bankAccountId });
        if (!account || account.userId !== userId) throw new ForbiddenException();
      }
      tx.bankAccountId = dto.bankAccountId ?? undefined;
    }
    if (dto.name !== undefined) tx.name = dto.name;
    if (dto.amount !== undefined) tx.amount = dto.amount;
    if (dto.date !== undefined) tx.date = dto.date;
    if (dto.note !== undefined) tx.note = dto.note ?? null;
    const saved = await this.repo.save(tx);
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'bankAccount'] });
  }

  async updateNote(id: string, userId: string, note: string | null): Promise<{ id: string; note: string | null }> {
    if (note && note.length > 500) throw new BadRequestException('Note must be 500 characters or fewer');
    const tx = await this.repo.findOneBy({ id, userId });
    if (!tx) throw new NotFoundException();
    tx.note = note;
    await this.repo.save(tx);
    return { id, note };
  }

  async deleteManual(id: string, userId: string): Promise<void> {
    const tx = await this.repo.findOneBy({ id, userId });
    if (!tx) throw new NotFoundException();
    if (!DELETABLE_SOURCES.has(tx.source)) {
      throw new BadRequestException(
        'Transactions synced from your bank cannot be deleted — they would return on the next sync',
      );
    }
    if (tx.isSplitParent) throw new BadRequestException('Cannot delete a split transaction — unsplit it first');

    /* Remove the linked debt payment, if this tx was a debt repayment */
    if (tx.debtId) {
      await this.debtsService.removePaymentByTransaction(tx.id);
    }

    /* Reverse the transfer account balance adjustment */
    if (tx.transferAccountId) {
      await this.adjustTransferBalance(tx.transferAccountId, userId, Number(tx.amount), 'undo');
    }

    /* Clear the counterpart's back-link */
    if (tx.counterpartTxId) {
      const counterpart = await this.repo.findOneBy({ id: tx.counterpartTxId, userId });
      if (counterpart) {
        counterpart.counterpartTxId   = undefined;
        counterpart.transferAccountId = undefined;
        await this.repo.save(counterpart);
      }
    }

    await this.repo.remove(tx);
  }

  async updateCategory(id: string, userId: string, categoryId: string | null): Promise<Transaction> {
    const tx = await this.repo.findOneByOrFail({ id, userId });

    // Assigning a real category unlinks any existing debt
    if (categoryId && tx.debtId) {
      await this.debtsService.removePaymentByTransaction(tx.id);
      tx.debtId = undefined;
    }

    /* If clearing a transfer category, undo balance + clear counterpart link */
    if (!categoryId && tx.transferAccountId) {
      await this.adjustTransferBalance(tx.transferAccountId, userId, Number(tx.amount), 'undo');
      if (tx.counterpartTxId) {
        const counterpart = await this.repo.findOneBy({ id: tx.counterpartTxId, userId });
        if (counterpart) {
          counterpart.counterpartTxId   = undefined;
          counterpart.transferAccountId = undefined;
          await this.repo.save(counterpart);
        }
      }
      tx.transferAccountId = undefined;
      tx.counterpartTxId   = undefined;
    }
    tx.categoryId = categoryId;
    tx.categorizedByRuleId = null;
    const saved = await this.repo.save(tx);
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'transferAccount', 'bankAccount'] });
  }

  async updateDebt(id: string, userId: string, debtId: string | null): Promise<Transaction> {
    const tx = await this.repo.findOneByOrFail({ id, userId });

    if (tx.debtId) {
      await this.debtsService.removePaymentByTransaction(tx.id);
    }

    // Clear any existing transfer link
    if (tx.transferAccountId) {
      await this.adjustTransferBalance(tx.transferAccountId, userId, Number(tx.amount), 'undo');
      if (tx.counterpartTxId) {
        const counterpart = await this.repo.findOneBy({ id: tx.counterpartTxId, userId });
        if (counterpart) {
          counterpart.counterpartTxId   = undefined;
          counterpart.transferAccountId = undefined;
          await this.repo.save(counterpart);
        }
      }
      tx.transferAccountId = undefined;
      tx.counterpartTxId   = undefined;
    }

    if (debtId) {
      tx.debtId    = debtId;
      tx.categoryId = undefined;
      tx.categorizedByRuleId = null;
      await this.repo.save(tx);
      await this.debtsService.recordPaymentFromTransaction(debtId, userId, {
        amount: Math.abs(Number(tx.amount)),
        date:   tx.date,
        transactionId: tx.id,
      });
    } else {
      tx.debtId = undefined;
      await this.repo.save(tx);
    }

    return this.repo.findOne({
      where: { id },
      relations: ['categoryRef', 'bankAccount', 'transferAccount'],
    });
  }

  async findTransferMatches(userId: string, amount: number, date: string, excludeAccountId: string): Promise<Transaction[]> {
    const absAmount = Math.abs(amount);
    const d = new Date(date + 'T12:00:00');
    const from = new Date(d.getTime() - 5 * 86400_000).toISOString().slice(0, 10);
    const to   = new Date(d.getTime() + 5 * 86400_000).toISOString().slice(0, 10);

    const candidates = await this.repo.createQueryBuilder('tx')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.categoryRef', 'categoryRef')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.bankAccountId != :excludeAccountId', { excludeAccountId })
      .andWhere('tx.date >= :from', { from })
      .andWhere('tx.date <= :to', { to })
      .getMany();

    // Both legs of a transfer are the same money seen twice: identical amount,
    // opposite direction. The old filter allowed a $1.00 discrepancy and never
    // checked direction at all, so a +$9.50 deposit was offered a -$10.00
    // payment — and two deposits could be linked to each other. Compare in
    // whole cents to keep float arithmetic out of an equality test.
    const cents = (n: number) => Math.round(n * 100);
    const wantCents = cents(absAmount);
    const sourceSign = Math.sign(amount);

    return candidates
      .filter(tx => {
        const other = Number(tx.amount);
        if (Math.sign(other) === sourceSign) return false;
        return cents(Math.abs(other)) === wantCents;
      })
      .sort((a, b) => {
        const ad = Math.abs(new Date(a.date).getTime() - d.getTime());
        const bd = Math.abs(new Date(b.date).getTime() - d.getTime());
        return ad - bd;
      });
  }

  async updateTransferAccount(
    id: string, userId: string,
    transferAccountId: string | null,
    matchTxId?: string | null,
    kind?: TransferKind | null,
  ): Promise<Transaction & { counterpart?: { id: string; categoryId: string | null; categoryRef: Category | null } }> {
    const tx = await this.repo.findOneByOrFail({ id, userId });
    const amount = Number(tx.amount);

    /* Undo previous transfer account balance change */
    if (tx.transferAccountId) {
      await this.adjustTransferBalance(tx.transferAccountId, userId, amount, 'undo');
    }
    /* Apply new transfer account balance change */
    if (transferAccountId) {
      await this.adjustTransferBalance(transferAccountId, userId, amount, 'apply');
    }

    tx.transferAccountId = transferAccountId ?? undefined;
    await this.repo.save(tx);

    /* Pair with the matched transaction and categorise BOTH sides from what
       the transfer means (savings, card payment, …) — never by copying the
       category of whichever side the user happened to start from. */
    let counterpart: { id: string; categoryId: string | null; categoryRef: Category | null } | undefined;
    if (matchTxId) {
      const matchTx = await this.repo.findOneBy({ id: matchTxId, userId });
      if (matchTx) {
        if (matchTx.transferAccountId) {
          await this.adjustTransferBalance(matchTx.transferAccountId, userId, Number(matchTx.amount), 'undo');
        }
        const [fromTx, toTx] = amount < 0 ? [tx, matchTx] : [matchTx, tx];
        const [fromAcc, toAcc] = await Promise.all([
          fromTx.bankAccountId ? this.accountRepo.findOneBy({ id: fromTx.bankAccountId, userId }) : null,
          toTx.bankAccountId ? this.accountRepo.findOneBy({ id: toTx.bankAccountId, userId }) : null,
        ]);
        const allowed = transferKindOptions(fromAcc?.accountType ?? '', toAcc?.accountType ?? '');
        const resolved: TransferKind = kind == null ? defaultTransferKind(fromAcc?.accountType ?? '', toAcc?.accountType ?? '') : kind;
        if (!isTransferKind(resolved) || !allowed.includes(resolved)) {
          throw new BadRequestException(`This transfer cannot be marked as "${String(kind)}" between these accounts.`);
        }
        const names = categoriesForKind(resolved);
        const fromCat = await this.ensureCategory(userId, names.from);
        const toCat = await this.ensureCategory(userId, names.to);

        fromTx.categoryId = fromCat.id; fromTx.categorizedByRuleId = null;
        toTx.categoryId = toCat.id; toTx.categorizedByRuleId = null;
        matchTx.transferAccountId = tx.bankAccountId ?? undefined;
        matchTx.counterpartTxId   = id;
        tx.counterpartTxId = matchTxId;
        await this.repo.save([tx, matchTx]);
        counterpart = { id: matchTx.id, categoryId: matchTx.categoryId ?? null, categoryRef: matchTx.id === toTx.id ? toCat : fromCat };
      } else {
        await this.repo.update(id, { counterpartTxId: matchTxId });
      }
    }

    const fresh = await this.repo.findOne({ where: { id }, relations: ['categoryRef', 'bankAccount', 'transferAccount'] });
    return counterpart ? Object.assign(fresh!, { counterpart }) : fresh!;
  }

  /** The user's category of that name, created from the transfer defaults if they lack it. */
  private async ensureCategory(userId: string, name: string): Promise<Category> {
    const existing = await this.categoryRepo.findOneBy({ userId, name });
    if (existing) return existing;
    const def = TRANSFER_CATEGORY_DEFAULTS.find((d) => d.name === name);
    if (!def) throw new BadRequestException(`Unknown transfer category "${name}".`);
    return this.categoryRepo.save(this.categoryRepo.create({ ...def, userId, isDefault: true }));
  }

  /* delta = -amount: outgoing -$2000 → dest gets +$2000; incoming +$2000 → source loses $2000 */
  private async adjustTransferBalance(
    accountId: string, userId: string, txAmount: number, mode: 'apply' | 'undo',
  ): Promise<void> {
    const acc = await this.accountRepo.findOneBy({ id: accountId, userId });
    if (!acc) return;
    const delta = -txAmount; // positive for outgoing tx, negative for incoming
    acc.balance = Number(acc.balance) + (mode === 'apply' ? delta : -delta);
    await this.accountRepo.save(acc);
  }

  async split(
    id: string,
    userId: string,
    splits: SplitPiece[],
  ): Promise<Transaction[]> {
    const tx = await this.repo.findOneByOrFail({ id, userId });
    if (tx.isSplitParent) throw new BadRequestException('Transaction is already split');
    if (tx.parentId) throw new BadRequestException('Cannot split a split piece — unsplit the parent first');
    if (splits.length < 2) throw new BadRequestException('At least 2 split pieces required');

    const txTotal = Math.abs(Number(tx.amount));
    const splitTotal = splits.reduce((s, p) => s + Math.abs(p.amount), 0);
    if (Math.abs(splitTotal - txTotal) > 0.01) {
      throw new BadRequestException(
        `Split amounts (${splitTotal.toFixed(2)}) must sum to the transaction total (${txTotal.toFixed(2)})`,
      );
    }

    // A row is either budget-categorised or project-categorised, never both:
    // budgets match project budgets on (projectId, projectCategoryId) and regular
    // budgets on categoryId, so a row carrying both is counted twice. The web
    // client already enforces this; splitting is the one path where a bad row
    // cannot be corrected afterwards, so enforce it here too.
    for (const piece of splits) {
      if (piece.categoryId && piece.projectCategoryId) {
        throw new BadRequestException('A split piece cannot have both a category and a project category');
      }
      if (piece.projectCategoryId && !piece.projectId) {
        throw new BadRequestException('A project category requires its project');
      }
    }

    await this.assertOwnsProjectRefs(userId, splits);

    // The parent is stripped below; keep its project link so pieces that do not
    // name one of their own stay on the project instead of silently leaving it.
    const parentProjectId = tx.projectId ?? null;
    const parentProjectCategoryId = tx.projectCategoryId ?? null;

    const sign = Number(tx.amount) >= 0 ? 1 : -1;

    const childIds: string[] = await this.repo.manager.transaction(async (em) => {
      tx.isSplitParent = true;
      tx.categoryId = null;
      tx.categorizedByRuleId = null;
      tx.projectId = null;
      tx.projectCategoryId = null;
      await em.save(tx);

      const ids: string[] = [];
      for (const piece of splits) {
        // Inherit the parent's project only when the piece names neither a
        // category nor a project of its own.
        const inherits = !piece.categoryId && !piece.projectId && !piece.projectCategoryId;
        const child = em.create(Transaction, {
          userId: tx.userId,
          parentId: tx.id,
          bankAccountId: tx.bankAccountId ?? undefined,
          source: tx.source,
          name: tx.name,
          date: tx.date,
          amount: sign * Math.abs(piece.amount),
          categoryId: piece.categoryId ?? undefined,
          projectId: (inherits ? parentProjectId : piece.projectId) ?? undefined,
          projectCategoryId: (inherits ? parentProjectCategoryId : piece.projectCategoryId) ?? undefined,
          pending: tx.pending,
          isSplitParent: false,
          receiptId: tx.receiptId ?? undefined,
        });
        const saved = await em.save(child);
        ids.push(saved.id);
      }
      return ids;
    });

    return Promise.all(
      childIds.map((cid) =>
        this.repo.findOne({ where: { id: cid }, relations: ['categoryRef', 'bankAccount', 'projectCategoryRef'] }),
      ),
    );
  }

  /** Reject project / project-category ids that belong to someone else. There is
      no global ValidationPipe, so this is the only thing standing between the
      request body and a cross-tenant write. Batched: two queries at most. */
  private async assertOwnsProjectRefs(userId: string, splits: SplitPiece[]): Promise<void> {
    const projectIds = [...new Set(splits.map((p) => p.projectId).filter((v): v is string => !!v))];
    const projCatIds = [...new Set(splits.map((p) => p.projectCategoryId).filter((v): v is string => !!v))];

    if (projectIds.length) {
      const found = await this.projectRepo.find({ where: { id: In(projectIds) } });
      if (found.length !== projectIds.length || found.some((p) => p.userId !== userId)) {
        throw new ForbiddenException('Unknown project');
      }
    }
    if (projCatIds.length) {
      const found = await this.projCatRepo.find({ where: { id: In(projCatIds) } });
      if (found.length !== projCatIds.length || found.some((c) => c.userId !== userId)) {
        throw new ForbiddenException('Unknown project category');
      }
    }
  }

  async unsplit(id: string, userId: string): Promise<Transaction> {
    let tx = await this.repo.findOneBy({ id, userId });
    if (!tx) throw new NotFoundException();

    // Accept either a child id or the parent id
    if (tx.parentId) {
      tx = await this.repo.findOneBy({ id: tx.parentId, userId });
      if (!tx) throw new NotFoundException();
    }

    if (!tx.isSplitParent) throw new BadRequestException('Transaction is not split');

    await this.repo.delete({ parentId: tx.id, userId });

    tx.isSplitParent = false;
    tx.categoryId = null;
    tx.categorizedByRuleId = null;
    const saved = await this.repo.save(tx);
    return this.repo.findOne({
      where: { id: saved.id },
      relations: ['categoryRef', 'bankAccount'],
    });
  }
}

/* Accepts MM/DD/YYYY or YYYY-MM-DD */
function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [m, d, y] = raw.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
