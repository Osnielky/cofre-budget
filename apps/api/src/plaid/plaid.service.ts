import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';
import { deriveKey, encryptToken, decryptToken } from '../common/token-crypto.util';
import { CategorizationRulesService } from '../categorization-rules/categorization-rules.service';

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
  private async getOrCreatePlaidUserId(userId: string): Promise<string> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    if (user.plaidUserId) return user.plaidUserId;

    const res = await this.client.userCreate({ client_user_id: userId });
    user.plaidUserId = res.data.user_id;
    await this.userRepo.save(user);
    return user.plaidUserId;
  }

  async createLinkToken(userId: string): Promise<string> {
    const plaidUserId = await this.getOrCreatePlaidUserId(userId);
    const webhook = this.config.get<string>('PLAID_WEBHOOK_URL');
    const redirectUri = this.config.get<string>('PLAID_OAUTH_REDIRECT_URI');
    try {
      const res = await this.client.linkTokenCreate({
        user_id: plaidUserId,
        client_name: 'Cofre Budget',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
        ...(webhook ? { webhook } : {}),
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      });
      return res.data.link_token;
    } catch (err) {
      this.logger.error('linkTokenCreate failed', (err as any)?.response?.data ?? err);
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
  ): Promise<PreviewExchangeResult> {
    const exchangeRes = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token, item_id } = exchangeRes.data;

    let item = await this.itemRepo.findOneBy({ itemId: item_id });
    if (!item) {
      item = this.itemRepo.create({ userId, itemId: item_id, institutionId, institutionName });
    }
    item.accessToken = encryptToken(access_token, this.encKey);
    await this.itemRepo.save(item);

    const manualAccounts = await this.accountRepo.find({ where: { userId, provider: 'manual' } });
    const balanceRes = await this.client.accountsBalanceGet({ access_token });
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
    const balanceRes = await this.client.accountsBalanceGet({ access_token: accessToken });
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
      });
      accounts.push(await this.accountRepo.save(account));
    }

    await this.runSync(item, accessToken, cutoverDates.size > 0 ? cutoverDates : undefined);
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
    const balanceRes = await this.client.accountsBalanceGet({ access_token: accessToken });
    for (const pa of balanceRes.data.accounts) {
      const account = await this.accountRepo.findOneBy({ plaidAccountId: pa.account_id });
      if (account) {
        account.balance = pa.balances.current ?? account.balance;
        await this.accountRepo.save(account);
      }
    }
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
  ): Promise<void> {
    if (this.syncsInFlight.has(item.itemId)) {
      this.logger.warn(`Sync already in flight for item ${item.itemId} — skipping this trigger`);
      return;
    }
    this.syncsInFlight.add(item.itemId);

    try {
      let cursor = item.cursor ?? undefined;
      let hasMore = true;
      const rules = await this.rulesService.getActiveRules(item.userId);
      const accountCache = new Map<string, BankAccount | null>();

      const getAccount = async (plaidAccountId: string): Promise<BankAccount | null> => {
        if (accountCache.has(plaidAccountId)) return accountCache.get(plaidAccountId) ?? null;
        const account = await this.accountRepo.findOneBy({ plaidAccountId });
        accountCache.set(plaidAccountId, account);
        return account;
      };

      while (hasMore) {
        const res = await this.client.transactionsSync({ access_token: accessToken, cursor });

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
            await this.txRepo.save(existing);
            continue;
          }

          const cutoff = cutoverDates?.get(pt.account_id);
          if (cutoff && pt.date < cutoff) continue;

          const matchedRule = this.rulesService.matchRule(rules, { merchantName: pt.merchant_name, name: pt.name });
          await this.txRepo.save(
            this.txRepo.create({
              userId: item.userId,
              bankAccountId: account.id,
              externalId: pt.transaction_id,
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
        }

        for (const rt of res.data.removed) {
          const victim = await this.txRepo.findOneBy({ externalId: rt.transaction_id, userId: item.userId });
          if (victim) {
            /* A split parent's children have no externalId of their own — Plaid never
               references them directly, so they'd otherwise be orphaned (and still
               counted, since totals exclude only the parent) when the parent transaction
               is removed (e.g. a pending transaction that posted under a new id). */
            if (victim.isSplitParent) {
              await this.txRepo.delete({ parentId: victim.id, userId: item.userId });
            }
            await this.txRepo.delete({ id: victim.id });
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
      await this.client.itemRemove({ access_token: accessToken });
      await this.itemRepo.remove(item);
    } catch (err) {
      this.logger.error(`Failed to remove Plaid item ${item.itemId}`, err);
    }
  }

  /* Update-mode link token: reuses the existing Item's access token so the user
     re-authenticates the same connection instead of creating a new one. */
  async createReconnectLinkToken(userId: string, plaidItemId: string): Promise<string> {
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
      const res = await this.client.linkTokenCreate({
        user_id: plaidUserId,
        client_name: 'Cofre Budget',
        access_token: accessToken,
        country_codes: [CountryCode.Us],
        language: 'en',
        ...(webhook ? { webhook } : {}),
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      });
      return res.data.link_token;
    } catch (err) {
      this.logger.error('linkTokenCreate (reconnect) failed', (err as any)?.response?.data ?? err);
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

    const refreshed = await this.itemRepo.findOneBy({ id: plaidItemId });
    return { status: refreshed?.status ?? item.status, errorCode: refreshed?.errorCode ?? null };
  }
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
