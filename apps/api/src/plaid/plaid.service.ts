import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  AccountType,
} from 'plaid';
import { PlaidItem } from './plaid-item.entity';
import { parsePlaidCountries } from './plaid-countries';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionTombstone } from '../transactions/transaction-tombstone.entity';
import { User } from '../users/user.entity';
import { deriveKey, encryptToken, decryptToken } from '../common/token-crypto.util';
import { CategorizationRulesService } from '../categorization-rules/categorization-rules.service';
import { timed } from '../common/logging/timed';
import { CreditCardsService } from '../cards/credit-cards.service';
import { investmentsErrorStatus, investmentsWindow, mapInvestmentTransaction, PlaidInvestmentTx, PlaidSecurityLite } from './investments.mapper';
import { mapPlaidCard, liabilitiesErrorStatus } from '../cards/liabilities.mapper';
import type { LiabilitiesStatus } from '../cards/card-types';

export interface PreviewAccount {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  subtype: string;
  balance: number;
  currency: string;
  suggestedMatch: { id: string; accountName: string; lastTransactionDate: string | null } | null;
}

export interface PreviewExchangeResult {
  plaidItemId: string;
  institutionName: string;
  hasManualAccounts: boolean;
  accounts: PreviewAccount[];
}

export interface ExchangeDecision {
  plaidAccountId: string;
  action: 'new' | 'merge';
  mergeIntoAccountId?: string;
  cutoverDate?: string;
}

/** What one /transactions/sync pass did. */
export interface SyncCounts { added: number; modified: number; removed: number; /** Removals a page asked for beyond MAX_REMOVALS_PER_SYNC; the rows were kept. */ removalsRefused?: number }

/** Linked institutions (Plaid items) a plan may hold. Plaid bills per connected
 *  account per month, so the cap is what keeps each tier's cost under its price;
 *  plans missing here (free) never reach this check — PlanGuard stops them first. */
export const INSTITUTION_CAPS: Record<string, number> = { pro: 4, elite: 10 };

/** Most rows one sync may delete on Plaid's say-so. A normal removed[] carries one or
 *  two entries (a pending charge that posted under a new id). Anything past this looks
 *  like an institution migration retracting an account's history, so the rows stay,
 *  the sync logs an error, and a person decides (2026-10-28: a Schwab account lost
 *  every month before this guard existed). */
export const MAX_REMOVALS_PER_SYNC = 10;

@Injectable()
export class PlaidService {
  private readonly client: PlaidApi;
  private readonly logger = new Logger(PlaidService.name);
  private readonly encKey: Buffer;
  private readonly syncsInFlight = new Set<string>();

  constructor(
    private config: ConfigService,
    @InjectRepository(PlaidItem) private itemRepo: Repository<PlaidItem>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private rulesService: CategorizationRulesService,
    private creditCards: CreditCardsService,
    @InjectRepository(TransactionTombstone) private tombstones: Repository<TransactionTombstone>,
  ) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is required for PlaidService token encryption');
    this.encKey = deriveKey(secret);
    const env = this.config.get<string>('PLAID_ENV', 'sandbox');
    const cfg = new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.config.get<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.config.get<string>('PLAID_SECRET'),
        },
      },
    });
    this.client = new PlaidApi(cfg);
  }

  /* Plaid's newer User API: integrations approved after Dec 10, 2025 must pass
     `user_id` (from /user/create) to linkTokenCreate — the legacy `user: {client_user_id}`
     field alone is rejected with a 400 for these accounts. Cached on the User row since
     it's a persistent identity, not per-Item. */
  /* Products a new link may add on top of Transactions. Each is gated because Plaid
     rejects link tokens naming a product the client is not approved for, which would
     break bank linking for everyone. */
  private optionalProducts(): Products[] {
    const list: Products[] = [];
    if (this.config.get<string>('PLAID_LIABILITIES_ENABLED') === 'true') list.push(Products.Liabilities);
    if (this.investmentsEnabled()) list.push(Products.Investments);
    return list;
  }

  private investmentsEnabled(): boolean {
    return this.config.get<string>('PLAID_INVESTMENTS_ENABLED') === 'true';
  }

  private async getOrCreatePlaidUserId(userId: string): Promise<string> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    if (user.plaidUserId) return user.plaidUserId;

    const res = await timed('plaid', 'userCreate', () => this.client.userCreate({ client_user_id: userId }));
    user.plaidUserId = res.data.user_id;
    await this.userRepo.save(user);
    return user.plaidUserId;
  }

  async createLinkToken(userId: string): Promise<string> {
    const plaidUserId = await this.getOrCreatePlaidUserId(userId);
    const webhook = this.config.get<string>('PLAID_WEBHOOK_URL');
    const redirectUri = this.config.get<string>('PLAID_OAUTH_REDIRECT_URI');
    try {
      const res = await timed('plaid', 'linkTokenCreate', () => this.client.linkTokenCreate({
        user_id: plaidUserId,
        client_name: 'Cofre Budget',
        products: [Products.Transactions],
        /* Plaid's default pull is 90 days; ask for the maximum so a new link (or a
           re-link after a lost history) brings back two years where the bank has it. */
        transactions: { days_requested: 730 },
        /* Best effort: banks without Liabilities still link; cards there get manual entry.
           Gated because Plaid rejects link tokens that name a product the client isn't
           approved for — set PLAID_LIABILITIES_ENABLED=true once Plaid approves it. */
        ...(this.optionalProducts().length > 0 ? { optional_products: this.optionalProducts() } : {}),
        country_codes: parsePlaidCountries(this.config.get<string>('PLAID_COUNTRY_CODES')),
        language: 'en',
        ...(webhook ? { webhook } : {}),
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }));
      return res.data.link_token;
    } catch (err) {
      const code = (err as any)?.response?.data?.error_code ?? (err as Error)?.message;
      this.logger.error(`linkTokenCreate failed: ${code}`);
      throw err;
    }
  }

  /* Step 1 of connecting a bank: exchanges the public token (so the PlaidItem exists
     and is ready to sync) and reports back what Plaid returned, WITHOUT creating any
     BankAccount rows yet. If the user has manual accounts, the frontend shows a review
     step so a manual "Bank of America Checking" can be upgraded in place instead of
     ending up duplicated alongside a new Plaid-connected one. Suggests a match by exact
     bank name + last-4-digit mask; the user confirms or overrides via confirmExchange. */
  async previewExchange(
    userId: string,
    publicToken: string,
    institutionId: string,
    institutionName: string,
    plan: 'free' | 'pro' | 'elite',
  ): Promise<PreviewExchangeResult> {
    const exchangeRes = await timed('plaid', 'itemPublicTokenExchange', () => this.client.itemPublicTokenExchange({ public_token: publicToken }));
    const { access_token, item_id } = exchangeRes.data;

    let item = await this.itemRepo.findOneBy({ itemId: item_id });
    if (!item) {
      const cap = INSTITUTION_CAPS[plan];
      if (cap != null) {
        const count = await this.itemRepo.count({ where: { userId } });
        if (count >= cap) {
          await timed('plaid', 'itemRemove', () => this.client.itemRemove({ access_token }));
          throw new ForbiddenException({
            message: plan === 'elite'
              ? `Elite is limited to ${cap} linked institutions. Remove one in Settings → Bank Accounts to connect another.`
              : `Pro is limited to ${cap} linked institutions — upgrade to Elite for up to ${INSTITUTION_CAPS.elite}.`,
            code: 'INSTITUTION_LIMIT_REACHED',
          });
        }
      }
      item = this.itemRepo.create({ userId, itemId: item_id, institutionId, institutionName });
    }
    item.accessToken = encryptToken(access_token, this.encKey);
    await this.itemRepo.save(item);

    const manualAccounts = await this.accountRepo.find({ where: { userId, provider: 'manual' } });
    const balanceRes = await timed('plaid', 'accountsBalanceGet', () => this.client.accountsBalanceGet({ access_token }));
    const accounts: PreviewAccount[] = [];

    for (const pa of balanceRes.data.accounts) {
      const mask = pa.mask ?? null;
      const match = mask
        ? manualAccounts.find(
            (m) => m.bankName.trim().toLowerCase() === institutionName.trim().toLowerCase() && m.last4 === mask,
          )
        : undefined;

      let lastTransactionDate: string | null = null;
      if (match) {
        const latest = await this.txRepo.findOne({ where: { bankAccountId: match.id }, order: { date: 'DESC' } });
        lastTransactionDate = latest?.date ?? null;
      }

      accounts.push({
        plaidAccountId: pa.account_id,
        name: pa.name,
        mask,
        subtype: pa.subtype ?? '',
        balance: pa.balances.current ?? 0,
        currency: (pa.balances.iso_currency_code ?? 'USD').toUpperCase(),
        suggestedMatch: match ? { id: match.id, accountName: match.accountName, lastTransactionDate } : null,
      });
    }

    return {
      plaidItemId: item.id,
      institutionName,
      hasManualAccounts: manualAccounts.length > 0,
      accounts,
    };
  }

  /* Step 2: applies the user's create-new/merge decisions from the preview, then runs
     the initial sync. A merge decision upgrades the existing BankAccount row in place
     (keeps its id, name, color, history — just attaches the Plaid connection) rather
     than creating a duplicate. cutoverDate (per merged account) skips any Plaid
     transaction older than the user's last manual entry for that account, so the
     initial historical pull doesn't double up with what's already there. */
  async confirmExchange(
    userId: string,
    plaidItemId: string,
    decisions: ExchangeDecision[],
  ): Promise<BankAccount[]> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');

    const accessToken = decryptToken(item.accessToken, this.encKey);
    const balanceRes = await timed('plaid', 'accountsBalanceGet', () => this.client.accountsBalanceGet({ access_token: accessToken }));
    const byId = new Map(balanceRes.data.accounts.map((a) => [a.account_id, a]));

    const accounts: BankAccount[] = [];
    const cutoverDates = new Map<string, string>();

    for (const decision of decisions) {
      const pa = byId.get(decision.plaidAccountId);
      if (!pa) continue;

      if (decision.action === 'merge' && decision.mergeIntoAccountId) {
        const existing = await this.accountRepo.findOneBy({ id: decision.mergeIntoAccountId });
        if (!existing || existing.userId !== userId || existing.provider !== 'manual') {
          throw new NotFoundException('Account not found');
        }

        existing.provider = 'plaid';
        existing.plaidItemId = item.id;
        existing.plaidAccountId = pa.account_id;
        existing.balance = pa.balances.current ?? existing.balance;
        if (!existing.last4 && pa.mask) existing.last4 = pa.mask.slice(-4);
        accounts.push(await this.accountRepo.save(existing));

        if (decision.cutoverDate) cutoverDates.set(pa.account_id, decision.cutoverDate);
        continue;
      }

      const account = this.accountRepo.create({
        userId,
        bankName: item.institutionName,
        accountName: pa.name,
        accountType: mapPlaidSubtype(pa.subtype ?? ''),
        balance: pa.balances.current ?? 0,
        currency: (pa.balances.iso_currency_code ?? 'USD').toUpperCase(),
        provider: 'plaid',
        plaidItemId: item.id,
        plaidAccountId: pa.account_id,
        last4: last4FromMask(pa.mask),
      });
      accounts.push(await this.accountRepo.save(account));
    }

    await this.runSync(item, accessToken, cutoverDates.size > 0 ? cutoverDates : undefined);
    await this.syncLiabilities(item, accessToken);
    await this.syncInvestments(item, accessToken);
    return accounts;
  }

  async syncItem(itemId: string, userId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :itemId AND item.userId = :userId', { itemId, userId })
      .getOne();

    if (!item) return;
    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.runSync(item, accessToken);

    /* Refresh balances */
    const balanceRes = await timed('plaid', 'accountsBalanceGet', () => this.client.accountsBalanceGet({ access_token: accessToken }));
    for (const pa of balanceRes.data.accounts) {
      const account = await this.accountRepo.findOneBy({ plaidAccountId: pa.account_id });
      if (account) {
        account.balance = pa.balances.current ?? account.balance;
        // Accounts connected before masks were stored get their last 4 digits here.
        if (!account.last4 && pa.mask) account.last4 = pa.mask.slice(-4);
        await this.accountRepo.save(account);
      }
    }
    await this.syncLiabilities(item, accessToken);
    await this.syncInvestments(item, accessToken);
  }

  /** Re-download everything Plaid still holds for the item (its full history window,
   *  not just changes since the cursor) and refresh balances. Rows already present
   *  are matched by Plaid's transaction id and updated, never duplicated. Used by
   *  "Re-download history" in Settings when a bank's rows went missing. */
  async resyncItemFromScratch(itemId: string, userId: string): Promise<SyncCounts> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :itemId AND item.userId = :userId', { itemId, userId })
      .getOne();
    if (!item) throw new NotFoundException();
    if (this.syncsInFlight.has(item.itemId)) throw new ConflictException('A sync is already running for this bank.');
    item.cursor = null;
    item.investmentsSyncedThrough = null;
    const accessToken = decryptToken(item.accessToken, this.encKey);
    const counts = await this.runSync(item, accessToken);
    const balanceRes = await timed('plaid', 'accountsBalanceGet', () => this.client.accountsBalanceGet({ access_token: accessToken }));
    for (const pa of balanceRes.data.accounts) {
      const account = await this.accountRepo.findOneBy({ plaidAccountId: pa.account_id });
      if (account) {
        account.balance = pa.balances.current ?? account.balance;
        await this.accountRepo.save(account);
      }
    }
    return counts;
  }

  /* Looked up by Plaid's item_id (not our PlaidItem.id) — this is what webhook
     payloads carry, with no authenticated user in the request. */
  async syncByExternalItemId(externalItemId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.itemId = :externalItemId', { externalItemId })
      .getOne();
    if (!item) return;
    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.runSync(item, accessToken);
  }

  async markItemStatus(externalItemId: string, status: string, errorCode: string | null): Promise<void> {
    const item = await this.itemRepo.findOneBy({ itemId: externalItemId });
    if (!item) return;
    item.status = status;
    item.errorCode = errorCode;
    await this.itemRepo.save(item);
  }

  /* Card data (limit, APRs, statement, due date) from /liabilities/get, handed to
     CreditCardsService per credit account. Never throws: a card-data problem must not
     fail the connect / sync / reconnect that triggered it. Expected "no data" errors
     (no consent yet, unsupported bank, still extracting) fall back to /accounts/get so
     limit and card name are still stored, and set that status on each card. Logs only
     the Plaid error code — axios errors carry the request, which holds the access token. */
  async syncLiabilities(item: PlaidItem, accessToken: string): Promise<void> {
    try {
      let accounts;
      let credit: { account_id: string | null }[] = [];
      let status: LiabilitiesStatus = 'synced';
      try {
        const res = await timed('plaid', 'liabilitiesGet', () => this.client.liabilitiesGet({ access_token: accessToken }));
        accounts = res.data.accounts;
        credit = res.data.liabilities.credit ?? [];
      } catch (err) {
        const code: string | undefined = (err as any)?.response?.data?.error_code;
        const fallback = liabilitiesErrorStatus(code);
        if (!fallback) throw err;
        this.logger.log(`Liabilities unavailable for item ${item.itemId}: ${code}`);
        status = fallback;
        accounts = (await timed('plaid', 'accountsGet', () => this.client.accountsGet({ access_token: accessToken }))).data.accounts;
      }

      const creditById = new Map(credit.map((c) => [c.account_id, c]));
      for (const pa of accounts) {
        if (pa.type !== AccountType.Credit) continue;
        const liability = (creditById.get(pa.account_id) ?? null) as Parameters<typeof mapPlaidCard>[1];
        await this.creditCards.applyPlaidReport(item.userId, {
          plaidAccountId: pa.account_id,
          data: mapPlaidCard(pa, liability),
          status: status === 'synced' && !liability ? 'unsupported' : status,
        });
      }
    } catch (err) {
      const code = (err as any)?.response?.data?.error_code ?? (err as Error)?.message;
      this.logger.error(`Liabilities sync failed for item ${item.itemId}: ${code}`);
    }
  }

  /* Brokerage / IRA / 401k activity from /investments/transactions/get, which is the only
     place Plaid serves it (the Transactions feed skips investment accounts). Runs only
     when PLAID_INVESTMENTS_ENABLED is on and the item holds at least one investment
     account, so banks without one never cost an Investments call. Never throws: an
     Investments problem must not fail the sync that triggered it. Rows are keyed by
     Plaid's investment_transaction_id in externalId and updated in place; a "cancel"
     entry removes the row it cancels (tombstoned) and is not stored itself. */
  async syncInvestments(item: PlaidItem, accessToken: string): Promise<void> {
    if (!this.investmentsEnabled()) return;
    try {
      const accounts = await this.accountRepo.find({ where: { plaidItemId: item.id, accountType: 'investment' } });
      if (accounts.length === 0) return;
      if (item.investmentsStatus === 'unsupported') return;
      const byPlaidId = new Map(accounts.map((a) => [a.plaidAccountId, a]));
      const { start, end } = investmentsWindow(item.investmentsSyncedThrough);

      const txs: PlaidInvestmentTx[] = [];
      const securities = new Map<string, PlaidSecurityLite>();
      let offset = 0;
      try {
        for (;;) {
          const res = await timed('plaid', 'investmentsTransactionsGet', () => this.client.investmentsTransactionsGet({
            access_token: accessToken, start_date: start, end_date: end,
            options: { account_ids: accounts.map((a) => a.plaidAccountId), count: 500, offset },
          }));
          for (const sec of res.data.securities) securities.set(sec.security_id, { security_id: sec.security_id, name: sec.name, ticker_symbol: sec.ticker_symbol });
          txs.push(...(res.data.investment_transactions as unknown as PlaidInvestmentTx[]));
          offset += res.data.investment_transactions.length;
          if (offset >= res.data.total_investment_transactions || res.data.investment_transactions.length === 0) break;
        }
      } catch (err) {
        const code: string | undefined = (err as any)?.response?.data?.error_code;
        const status = investmentsErrorStatus(code);
        if (!status) throw err;
        this.logger.log(`Investments unavailable for item ${item.itemId}: ${code}`);
        await this.itemRepo.update(item.id, { investmentsStatus: status });
        return;
      }

      for (const it of txs) {
        const account = byPlaidId.get(it.account_id);
        if (!account) continue;
        if (it.cancel_transaction_id) {
          const victim = await this.txRepo.findOneBy({ externalId: it.cancel_transaction_id, userId: item.userId, source: 'plaid' });
          if (victim) {
            await this.tombstones.save(this.tombstone(victim, 'plaid_cancelled'));
            await this.txRepo.delete({ id: victim.id });
          }
          continue;
        }
        const mapped = mapInvestmentTransaction(it, securities);
        const existing = await this.txRepo.findOneBy({ externalId: mapped.externalId, userId: item.userId });
        if (existing) {
          existing.amount = mapped.amount;
          existing.name = mapped.name;
          existing.date = mapped.date;
          existing.plaidCategory = mapped.plaidCategory;
          existing.symbol = mapped.symbol;
          existing.securityName = mapped.securityName;
          existing.quantity = mapped.quantity;
          existing.price = mapped.price;
          existing.fees = mapped.fees;
          await this.txRepo.save(existing);
          continue;
        }
        await this.txRepo.save(this.txRepo.create({
          userId: item.userId,
          bankAccountId: account.id,
          externalId: mapped.externalId,
          source: 'plaid',
          amount: mapped.amount,
          name: mapped.name,
          merchantName: null,
          plaidCategory: mapped.plaidCategory,
          date: mapped.date,
          pending: false,
          note: mapped.note,
          symbol: mapped.symbol,
          securityName: mapped.securityName,
          quantity: mapped.quantity,
          price: mapped.price,
          fees: mapped.fees,
        }));
      }
      await this.itemRepo.update(item.id, { investmentsStatus: 'synced', investmentsSyncedThrough: end });
      if (txs.length > 0) this.logger.log(`Investments sync for item ${item.itemId}: ${txs.length} transactions in ${start}..${end}`);
    } catch (err) {
      const code = (err as any)?.response?.data?.error_code ?? (err as Error)?.message;
      this.logger.error(`Investments sync failed for item ${item.itemId}: ${code}`);
    }
  }

  async syncInvestmentsByExternalItemId(externalItemId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.itemId = :externalItemId', { externalItemId })
      .getOne();
    if (!item) return;
    await this.syncInvestments(item, decryptToken(item.accessToken, this.encKey));
  }

  /* Update mode that asks the user to consent to Investments on an Item linked before
     Cofre requested it. Plaid bills Investments per connected investment account from then on. */
  createInvestmentsLinkToken(userId: string, plaidItemId: string): Promise<string> {
    if (!this.investmentsEnabled()) throw new ForbiddenException({ message: 'Investment activity is not enabled yet.', code: 'INVESTMENTS_DISABLED' });
    return this.updateModeLinkToken(userId, plaidItemId, { additional_consented_products: [Products.Investments] }, 'investments');
  }

  async completeInvestmentsConsent(plaidItemId: string, userId: string): Promise<{ status: string | null }> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');
    item.investmentsStatus = null;
    item.investmentsSyncedThrough = null;
    await this.itemRepo.save(item);
    await this.syncInvestments(item, decryptToken(item.accessToken, this.encKey));
    const refreshed = await this.itemRepo.findOneBy({ id: plaidItemId });
    return { status: refreshed?.investmentsStatus ?? null };
  }

  async syncLiabilitiesByExternalItemId(externalItemId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.itemId = :externalItemId', { externalItemId })
      .getOne();
    if (!item) return;
    await this.syncLiabilities(item, decryptToken(item.accessToken, this.encKey));
    await this.syncInvestments(item, decryptToken(item.accessToken, this.encKey));
  }

  /* Cursor-based sync via /transactions/sync — pages through everything new since
     item.cursor, applying added/modified/removed. On any failure the whole sync is
     abandoned without persisting a new cursor, which is safe: the next attempt just
     re-processes the same page, and every operation here (upsert-by-externalId,
     delete-by-externalId) is idempotent.

     Guarded by syncsInFlight (keyed by Plaid's item_id) because confirmExchange's initial
     sync can race a webhook-triggered sync for the same item (Plaid's webhook can arrive
     within seconds of the exchange completing, and redelivers on a ~10s timeout), and two
     concurrent runs would both try to insert the same new transaction and collide on the
     (userId, externalId) unique index.

     cutoverDates (Plaid account_id -> ISO date, only ever set by confirmExchange for a
     merged manual account) skips inserting any transaction on that specific account
     older than the date given — the account's own history before that point is already
     covered by the manual entries it's being merged with. Keyed per-account, not per-item,
     since one item can carry both a freshly-merged account (wants a cutover) and a
     brand-new one (wants full history) in the same sync pass. */
  private async runSync(
    item: PlaidItem,
    accessToken: string,
    cutoverDates?: Map<string, string>,
  ): Promise<SyncCounts> {
    const counts: SyncCounts = { added: 0, modified: 0, removed: 0 };
    if (this.syncsInFlight.has(item.itemId)) {
      this.logger.warn(`Sync already in flight for item ${item.itemId} — skipping this trigger`);
      return counts;
    }
    this.syncsInFlight.add(item.itemId);

    try {
      let cursor = item.cursor ?? undefined;
      let hasMore = true;
      const rules = await this.rulesService.getActiveRules(item.userId);
      const accountCache = new Map<string, BankAccount | null>();
      /* A merged account's own history (manual entries, CSV imports) and Plaid's
         overlap from the cutover date on. Each of the user's rows can absorb one
         Plaid transaction with the same date and amount, so the overlap isn't
         doubled while two genuinely separate identical charges both survive. */
      const consumed = new Set<string>();
      const alreadyTracked = async (accountId: string, date: string, amount: number): Promise<boolean> => {
        const candidates = await this.txRepo.find({
          where: { bankAccountId: accountId, userId: item.userId, date, source: Not('plaid') },
          select: ['id', 'amount'],
        });
        const hit = candidates.find((t) => !consumed.has(t.id) && Math.abs(Number(t.amount) - amount) < 0.005);
        if (!hit) return false;
        consumed.add(hit.id);
        return true;
      };

      const getAccount = async (plaidAccountId: string): Promise<BankAccount | null> => {
        if (accountCache.has(plaidAccountId)) return accountCache.get(plaidAccountId) ?? null;
        const account = await this.accountRepo.findOneBy({ plaidAccountId });
        accountCache.set(plaidAccountId, account);
        return account;
      };

      while (hasMore) {
        const res = await timed('plaid', 'transactionsSync', () => this.client.transactionsSync({ access_token: accessToken, cursor }));

        for (const pt of [...res.data.added, ...res.data.modified]) {
          const account = await getAccount(pt.account_id);
          if (!account) {
            this.logger.warn(
              `Skipping transaction ${pt.transaction_id} — no BankAccount for Plaid account ${pt.account_id} (item ${item.itemId})`,
            );
            continue;
          }

          const existing = await this.txRepo.findOneBy({ externalId: pt.transaction_id, userId: item.userId });
          if (existing) {
            existing.pending = pt.pending;
            existing.amount = -(pt.amount);
            existing.name = pt.name;
            existing.merchantName = pt.merchant_name ?? null;
            existing.plaidCategory = pt.category ?? [];
            existing.date = pt.date;
            /* Plaid often only enriches merchant_name/name once a pending transaction
               posts — the insert-time match below can miss on the generic pending
               name and never get a second chance. Re-match here (only while still
               uncategorized, so a manual pick or an earlier rule match is never
               overwritten) using the now-updated fields. */
            if (!existing.categoryId) {
              const matchedRule = this.rulesService.matchRule(rules, { merchantName: pt.merchant_name, name: pt.name });
              if (matchedRule) {
                existing.categoryId = matchedRule.categoryId;
                existing.categorizedByRuleId = matchedRule.id;
              }
            }
            await this.txRepo.save(existing);
            counts.modified++;
            continue;
          }

          const cutoff = cutoverDates?.get(pt.account_id);
          if (cutoff && pt.date < cutoff) continue;
          if (cutoff && (await alreadyTracked(account.id, pt.date, -(pt.amount)))) continue;

          const matchedRule = this.rulesService.matchRule(rules, { merchantName: pt.merchant_name, name: pt.name });
          await this.txRepo.save(
            this.txRepo.create({
              userId: item.userId,
              bankAccountId: account.id,
              externalId: pt.transaction_id,
              source: 'plaid',
              /* Plaid: positive = debit; we flip so positive = money in */
              amount: -(pt.amount),
              name: pt.name,
              merchantName: pt.merchant_name ?? null,
              plaidCategory: pt.category ?? [],
              date: pt.date,
              pending: pt.pending,
              categoryId: matchedRule?.categoryId ?? undefined,
              categorizedByRuleId: matchedRule?.id ?? undefined,
            }),
          );
          counts.added++;
        }

        if (res.data.removed.length > MAX_REMOVALS_PER_SYNC) {
          this.logger.error(
            `Refusing to delete ${res.data.removed.length} transactions Plaid reported removed for item ${item.itemId} (limit ${MAX_REMOVALS_PER_SYNC}); kept them for review`,
          );
          counts.removalsRefused = (counts.removalsRefused ?? 0) + res.data.removed.length;
        } else for (const rt of res.data.removed) {
          // Only ever a transaction Plaid itself created — never the user's own entries.
          const victim = await this.txRepo.findOneBy({ externalId: rt.transaction_id, userId: item.userId, source: 'plaid' });
          if (victim) {
            /* Plaid's removed[] usually means a pending transaction posted under a new id,
               but an institution migration can retract an account's whole history at
               once. Every row goes to transaction_tombstones first, so a retraction is
               reversible instead of a silent loss (2026-10-28: a Schwab account lost
               every month this way). */
            /* A split parent's children have no externalId of their own — Plaid never
               references them directly, so they'd otherwise be orphaned (and still
               counted, since totals exclude only the parent) when the parent transaction
               is removed. */
            if (victim.isSplitParent) {
              const children = await this.txRepo.findBy({ parentId: victim.id, userId: item.userId });
              await this.tombstones.save(children.map((c) => this.tombstone(c, 'plaid_removed_child')));
              await this.txRepo.delete({ parentId: victim.id, userId: item.userId });
            }
            await this.tombstones.save(this.tombstone(victim, 'plaid_removed'));
            await this.txRepo.delete({ id: victim.id });
            counts.removed++;
          }
        }

        cursor = res.data.next_cursor;
        hasMore = res.data.has_more;
      }

      item.cursor = cursor ?? null;
      item.lastSync = new Date();
      item.status = 'active';
      item.errorCode = null;
      await this.itemRepo.save(item);
    } catch (err) {
      this.logger.error('Transaction sync failed', err);
    } finally {
      this.syncsInFlight.delete(item.itemId);
    }
    return counts;
  }

  private tombstone(tx: Transaction, reason: string): TransactionTombstone {
    const { bankAccount, categoryRef, transferAccount, projectCategoryRef, categorizedByRule, ...payload } = tx as any;
    return this.tombstones.create({
      userId: tx.userId,
      transactionId: tx.id,
      bankAccountId: tx.bankAccountId ?? null,
      externalId: tx.externalId ?? null,
      reason,
      payload,
    });
  }

  findItemsByUser(userId: string): Promise<PlaidItem[]> {
    return this.itemRepo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  /* Called once no BankAccount references this item any more (a user disconnected the
     last account under it, or deleted their own Cofre account). Tells Plaid to actually
     terminate the item — otherwise it keeps syncing and billing indefinitely even though
     the user disconnected it. Scoped by userId so one user can't remove another's
     connection. If the Plaid call fails, the local row is left in place rather than
     deleted, so a later attempt can retry — deleting it here would strand the encrypted
     access token needed to ever call this again. */
  async removeItem(plaidItemId: string, userId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) return;

    try {
      const accessToken = decryptToken(item.accessToken, this.encKey);
      await timed('plaid', 'itemRemove', () => this.client.itemRemove({ access_token: accessToken }));
      await this.itemRepo.remove(item);
    } catch (err) {
      this.logger.error(`Failed to remove Plaid item ${item.itemId}`, err);
    }
  }

  /* Update-mode link token: reuses the existing Item's access token so the user
     re-authenticates the same connection instead of creating a new one. */
  createReconnectLinkToken(userId: string, plaidItemId: string): Promise<string> {
    return this.updateModeLinkToken(userId, plaidItemId, {}, 'reconnect');
  }

  /* Update mode that asks the user to consent to Liabilities on an Item linked before
     Cofre requested it. Plaid bills Liabilities per Item from then on. */
  createLiabilitiesLinkToken(userId: string, plaidItemId: string): Promise<string> {
    return this.updateModeLinkToken(userId, plaidItemId, { additional_consented_products: [Products.Liabilities] }, 'liabilities');
  }

  async completeLiabilitiesConsent(plaidItemId: string, userId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');
    await this.syncLiabilities(item, decryptToken(item.accessToken, this.encKey));
    await this.syncInvestments(item, decryptToken(item.accessToken, this.encKey));
  }

  private async updateModeLinkToken(
    userId: string,
    plaidItemId: string,
    extra: { additional_consented_products?: Products[] },
    purpose: string,
  ): Promise<string> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');

    const accessToken = decryptToken(item.accessToken, this.encKey);
    const plaidUserId = await this.getOrCreatePlaidUserId(userId);
    const webhook = this.config.get<string>('PLAID_WEBHOOK_URL');
    const redirectUri = this.config.get<string>('PLAID_OAUTH_REDIRECT_URI');
    try {
      const res = await timed('plaid', 'linkTokenCreate', () => this.client.linkTokenCreate({
        user_id: plaidUserId,
        client_name: 'Cofre Budget',
        access_token: accessToken,
        country_codes: parsePlaidCountries(this.config.get<string>('PLAID_COUNTRY_CODES')),
        language: 'en',
        ...extra,
        ...(webhook ? { webhook } : {}),
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }));
      return res.data.link_token;
    } catch (err) {
      const code = (err as any)?.response?.data?.error_code ?? (err as Error)?.message;
      this.logger.error(`linkTokenCreate (${purpose}) failed: ${code}`);
      throw err;
    }
  }

  /* Called after update-mode Link succeeds. A successful sync clears status/errorCode
     back to 'active' on its own (see runSync); this reads the item back after the sync
     attempt so the response reflects what actually happened, rather than always
     claiming success even if the underlying sync silently failed. */
  async completeReconnect(plaidItemId: string, userId: string): Promise<{ status: string; errorCode: string | null }> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');

    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.runSync(item, accessToken);
    await this.syncLiabilities(item, accessToken);
    await this.syncInvestments(item, accessToken);

    const refreshed = await this.itemRepo.findOneBy({ id: plaidItemId });
    return { status: refreshed?.status ?? item.status, errorCode: refreshed?.errorCode ?? null };
  }
}

/* Plaid's mask is the account number's last 2–4 digits; the column holds at most 4. */
function last4FromMask(mask: string | null | undefined): string | undefined {
  return mask ? mask.slice(-4) : undefined;
}

function mapPlaidSubtype(subtype: string): string {
  const map: Record<string, string> = {
    checking: 'checking',
    savings: 'savings',
    cd: 'savings',
    'money market': 'savings',
    credit: 'credit',
    'credit card': 'credit',
    brokerage: 'investment',
    '401k': 'investment',
    ira: 'investment',
  };
  return map[subtype.toLowerCase()] ?? 'checking';
}
