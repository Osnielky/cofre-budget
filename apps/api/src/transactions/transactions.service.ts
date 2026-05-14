import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';

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
  ) {}

  findByUser(userId: string, bankAccountId?: string, limit = 50): Promise<Transaction[]> {
    const qb = this.repo.createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .orderBy('tx.date', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .limit(limit);

    if (bankAccountId) qb.andWhere('tx.bankAccountId = :bankAccountId', { bankAccountId });
    return qb.getMany();
  }

  async importCsv(userId: string, bankAccountId: string, rows: CsvRow[]): Promise<{ imported: number; skipped: number }> {
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

    return { imported, skipped };
  }

  async updateCategory(id: string, userId: string, category: string): Promise<Transaction> {
    const tx = await this.repo.findOneByOrFail({ id, userId });
    tx.category = category;
    return this.repo.save(tx);
  }
}

/* Accepts MM/DD/YYYY or YYYY-MM-DD */
function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [m, d, y] = raw.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
