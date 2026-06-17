import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { DebtsService } from '../debts/debts.service';

export interface CsvRow {
  date: string;        // MM/DD/YYYY or YYYY-MM-DD
  referenceNumber?: string;
  name: string;
  amount: number;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction) private repo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(ProjectCategory) private projCatRepo: Repository<ProjectCategory>,
    private debtsService: DebtsService,
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
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .leftJoinAndSelect('tx.transferAccount', 'transferAccount')
      .where('tx.userId = :userId', { userId })
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
  ): Promise<{ newCount: number; duplicateCount: number; duplicateExternalIds: string[] }> {
    const account = await this.accountRepo.findOneBy({ id: bankAccountId });
    if (!account || account.userId !== userId) throw new ForbiddenException();

    /* Load all existing CSV transactions for this account once */
    const existing = await this.repo.find({
      where: { bankAccountId, userId, source: 'csv' },
      select: ['id', 'externalId', 'date', 'amount', 'name'],
    });

    /* Build lookup maps for fast in-memory checks */
    const byExternalId = new Map(existing.filter((t) => t.externalId).map((t) => [t.externalId, true]));

    const duplicateExternalIds: string[] = [];

    for (const row of rows) {
      const ref = row.referenceNumber?.trim();
      const amt2 = Number(row.amount).toFixed(2);           // "10.00"
      const amtRaw = String(row.amount);                    // "10" (old format, no toFixed)

      /* 1. Exact match by bank reference number */
      if (ref && byExternalId.has(`csv_${ref}`)) {
        duplicateExternalIds.push(`csv_${ref}`); continue;
      }

      /* 2. Composite key — new format (amount.toFixed(2)) */
      const key2 = `csv_${row.date}|${row.name}|${amt2}`;
      if (byExternalId.has(key2)) { duplicateExternalIds.push(key2); continue; }

      /* 3. Composite key — old format (${amount} without toFixed) for backward compat */
      const keyOld = `csv_${row.date}|${row.name}|${amtRaw}`;
      if (byExternalId.has(keyOld)) { duplicateExternalIds.push(keyOld); continue; }

      /* 4. Field match — catches transactions stored without externalId */
      const match = existing.find((t) =>
        t.date === row.date &&
        t.name === row.name &&
        Math.abs(Number(t.amount) - Number(row.amount)) < 0.005,
      );
      if (match) { duplicateExternalIds.push(`csv_${row.date}|${row.name}|${amt2}`); }
    }

    return {
      newCount: rows.length - duplicateExternalIds.length,
      duplicateCount: duplicateExternalIds.length,
      duplicateExternalIds,
    };
  }

  async importCsv(userId: string, bankAccountId: string, rows: CsvRow[], finalBalance?: number): Promise<{ imported: number; skipped: number; balanceUpdated?: boolean }> {
    const account = await this.accountRepo.findOneBy({ id: bankAccountId });
    if (!account || account.userId !== userId) throw new ForbiddenException();

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const externalId = row.referenceNumber ? `csv_${row.referenceNumber}` : null;

      if (externalId) {
        const exists = await this.repo.findOneBy({ externalId });
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
        }),
      );
      imported++;
    }

    let balanceUpdated = false;

    if (imported > 0) {
      if (finalBalance !== undefined && !isNaN(finalBalance)) {
        // CSV had an explicit balance column (e.g. BofA checking "Running Bal.")
        account.balance = finalBalance;
        await this.accountRepo.save(account);
        balanceUpdated = true;
      } else if (['credit', 'loan'].includes(account.accountType)) {
        // Credit/loan: recalculate balance as total amount owed from all transactions
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
    }

    return { imported, skipped, balanceUpdated };
  }

  async createManual(userId: string, dto: {
    name: string; amount: number; date: string;
    bankAccountId?: string | null; categoryId?: string | null; debtId?: string | null;
  }): Promise<Transaction> {
    if (dto.bankAccountId) {
      const account = await this.accountRepo.findOneBy({ id: dto.bankAccountId });
      if (!account || account.userId !== userId) throw new ForbiddenException();
    }
    if (dto.debtId && !(dto.amount > 0)) throw new BadRequestException('A debt repayment must be a positive (income) amount.');
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        bankAccountId: dto.bankAccountId ?? undefined,
        source: 'manual',
        amount: dto.amount,
        name: dto.name,
        date: dto.date,
        pending: false,
        categoryId: dto.debtId ? undefined : (dto.categoryId ?? undefined),
        debtId: dto.debtId ?? undefined,
      }),
    );
    if (dto.debtId) {
      try {
        await this.debtsService.recordPaymentFromTransaction(dto.debtId, userId, { amount: dto.amount, date: dto.date, transactionId: saved.id });
      } catch (e) {
        await this.repo.remove(saved); // don't leave an orphaned tx if the debt was invalid
        throw e;
      }
    }
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'bankAccount'] });
  }

  async updateManual(id: string, userId: string, dto: {
    name?: string; amount?: number; date?: string; bankAccountId?: string | null;
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
    const saved = await this.repo.save(tx);
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'bankAccount'] });
  }

  async deleteManual(id: string, userId: string): Promise<void> {
    const tx = await this.repo.findOneBy({ id, userId });
    if (!tx) throw new NotFoundException();
    if (tx.source !== 'manual') throw new BadRequestException('Only manual transactions can be deleted');

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
    tx.categoryId = categoryId ?? undefined;
    const saved = await this.repo.save(tx);
    return this.repo.findOne({ where: { id: saved.id }, relations: ['categoryRef', 'transferAccount'] });
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

    return candidates
      .filter(tx => Math.abs(Math.abs(Number(tx.amount)) - absAmount) < 1.00)
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
  ): Promise<Transaction> {
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

    /* Auto-categorize the matched transaction on the other side */
    if (matchTxId) {
      const matchTx = await this.repo.findOneBy({ id: matchTxId, userId });
      if (matchTx) {
        if (matchTx.transferAccountId) {
          await this.adjustTransferBalance(matchTx.transferAccountId, userId, Number(matchTx.amount), 'undo');
        }
        matchTx.categoryId        = tx.categoryId ?? undefined;
        matchTx.transferAccountId = tx.bankAccountId ?? undefined;
        matchTx.counterpartTxId   = id;
        await this.repo.save(matchTx);
      }
      /* Store the back-reference */
      await this.repo.update(id, { counterpartTxId: matchTxId });
    }

    return this.repo.findOne({ where: { id }, relations: ['categoryRef', 'bankAccount', 'transferAccount'] });
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
}

/* Accepts MM/DD/YYYY or YYYY-MM-DD */
function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [m, d, y] = raw.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
