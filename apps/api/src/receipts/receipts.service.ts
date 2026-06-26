import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from './receipt.entity';
import { Transaction } from '../transactions/transaction.entity';
import { GmailService } from '../gmail/gmail.service';

export interface ImportSplit {
  itemIndices: number[];
  categoryId: string | null;
  bankAccountId?: string | null;
}

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private gmail: GmailService,
  ) {}

  async syncAndFind(userId: string): Promise<Receipt[]> {
    const existing = await this.receiptRepo.find({ where: { userId } });
    const existingIds = new Set(existing.map((r) => r.gmailMessageId));

    let raw: Awaited<ReturnType<GmailService['fetchAndParseReceipts']>> = [];
    try {
      raw = await this.gmail.fetchAndParseReceipts(userId);
    } catch {
      // Gmail not connected or fetch failed — return cached only
      return existing;
    }

    const newReceipts = raw.filter((r) => !existingIds.has(r.gmailMessageId));
    for (const r of newReceipts) {
      // Defensive validation: validate items shape before saving
      const validItems = (r.items ?? []).filter((item) => {
        return (
          typeof item.name === 'string' &&
          typeof item.quantity === 'number' &&
          typeof item.unitPrice === 'number' &&
          typeof item.total === 'number'
        );
      });

      await this.receiptRepo.save(
        this.receiptRepo.create({
          userId,
          gmailMessageId: r.gmailMessageId,
          merchant: r.merchant,
          orderNumber: r.orderNumber ?? undefined,
          orderDate: r.orderDate ?? undefined,
          total: r.total,
          currency: r.currency,
          items: validItems,
          rawSubject: r.subject,
          imported: false,
        }),
      );
    }

    return this.receiptRepo.find({ where: { userId }, order: { parsedAt: 'DESC' } });
  }

  async importToTransactions(receiptId: string, userId: string, splits: ImportSplit[]): Promise<Transaction[]> {
    const receipt = await this.receiptRepo.findOneBy({ id: receiptId, userId });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const created: Transaction[] = [];

    for (const split of splits) {
      const splitTotal = split.itemIndices.reduce((sum, idx) => {
        const item = receipt.items[idx];
        return sum + (item?.total ?? 0);
      }, 0);

      if (splitTotal === 0) continue;

      const itemNames = split.itemIndices
        .map((idx) => receipt.items[idx]?.name)
        .filter(Boolean)
        .join(', ');

      const tx = await this.txRepo.save(
        this.txRepo.create({
          userId,
          source: 'manual',
          amount: -Math.abs(splitTotal),
          name: `${receipt.merchant}${itemNames ? ` — ${itemNames.slice(0, 100)}` : ''}`,
          date: receipt.orderDate ?? new Date().toISOString().slice(0, 10),
          pending: false,
          categoryId: split.categoryId ?? undefined,
          bankAccountId: split.bankAccountId ?? undefined,
          receiptId,
        }),
      );
      created.push(tx);
    }

    if (created.length > 0) {
      receipt.imported = true;
      await this.receiptRepo.save(receipt);
    }

    return created;
  }
}
