import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class PlaidService {
  private readonly client: PlaidApi;
  private readonly logger = new Logger(PlaidService.name);

  constructor(
    private config: ConfigService,
    @InjectRepository(PlaidItem) private itemRepo: Repository<PlaidItem>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {
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

  async createLinkToken(userId: string): Promise<string> {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Cofre Budget',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return res.data.link_token;
  }

  async exchangeToken(
    userId: string,
    publicToken: string,
    institutionId: string,
    institutionName: string,
  ): Promise<BankAccount[]> {
    const exchangeRes = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token, item_id } = exchangeRes.data;

    /* Upsert PlaidItem (re-connecting same institution reuses the record) */
    let item = await this.itemRepo.findOneBy({ itemId: item_id });
    if (!item) {
      item = this.itemRepo.create({ userId, itemId: item_id, institutionId, institutionName });
    }
    item.accessToken = access_token;
    await this.itemRepo.save(item);

    /* Fetch accounts from Plaid and create BankAccount records */
    const balanceRes = await this.client.accountsBalanceGet({ access_token });
    const accounts: BankAccount[] = [];

    for (const plaidAccount of balanceRes.data.accounts) {
      const existing = await this.accountRepo.findOneBy({ plaidAccountId: plaidAccount.account_id });
      if (existing) {
        existing.balance = plaidAccount.balances.current ?? existing.balance;
        accounts.push(await this.accountRepo.save(existing));
        continue;
      }

      const account = this.accountRepo.create({
        userId,
        bankName: institutionName,
        accountName: plaidAccount.name,
        accountType: mapPlaidSubtype(plaidAccount.subtype ?? ''),
        balance: plaidAccount.balances.current ?? 0,
        currency: (plaidAccount.balances.iso_currency_code ?? 'USD').toUpperCase(),
        provider: 'plaid',
        plaidItemId: item.id,
        plaidAccountId: plaidAccount.account_id,
      });
      accounts.push(await this.accountRepo.save(account));
    }

    /* Kick off an initial transaction sync */
    await this.syncTransactions(item);
    return accounts;
  }

  async syncItem(itemId: string, userId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :itemId AND item.userId = :userId', { itemId, userId })
      .getOne();

    if (!item) return;
    await this.syncTransactions(item);

    /* Refresh balances */
    const balanceRes = await this.client.accountsBalanceGet({ access_token: item.accessToken });
    for (const pa of balanceRes.data.accounts) {
      const account = await this.accountRepo.findOneBy({ plaidAccountId: pa.account_id });
      if (account) {
        account.balance = pa.balances.current ?? account.balance;
        await this.accountRepo.save(account);
      }
    }
  }

  private async syncTransactions(item: PlaidItem): Promise<void> {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

    try {
      const res = await this.client.transactionsGet({
        access_token: item.accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset: 0 },
      });

      for (const pt of res.data.transactions) {
        const account = await this.accountRepo.findOneBy({ plaidAccountId: pt.account_id });
        if (!account) continue;

        const existing = await this.txRepo.findOneBy({ externalId: pt.transaction_id });
        if (existing) {
          existing.pending = pt.pending;
          await this.txRepo.save(existing);
          continue;
        }

        await this.txRepo.save(
          this.txRepo.create({
            userId: item.userId,
            bankAccountId: account.id,
            externalId: pt.transaction_id,
            /* Plaid: positive = debit; we flip so positive = money in */
            amount: -(pt.amount),
            name: pt.name,
            merchantName: pt.merchant_name ?? undefined,
            plaidCategory: pt.category ?? [],
            date: pt.date,
            pending: pt.pending,
          }),
        );
      }

      item.lastSync = new Date();
      await this.itemRepo.save(item);
    } catch (err) {
      this.logger.error('Transaction sync failed', err);
    }
  }

  findItemsByUser(userId: string): Promise<PlaidItem[]> {
    return this.itemRepo.find({ where: { userId }, order: { createdAt: 'ASC' } });
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
