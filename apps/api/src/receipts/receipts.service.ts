import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Receipt } from './receipt.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Category } from '../categories/category.entity';
import { GmailService } from '../gmail/gmail.service';

export interface ImportSplit {
  itemIndices: number[];
  categoryId: string | null;
  bankAccountId?: string | null;
}

export type MatchStatus = 'matched' | 'pending';

export interface MatchedTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export interface ReceiptListItem extends Receipt {
  matchStatus: MatchStatus;
  matchedTransaction: MatchedTransaction | null;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(BankAccount) private accountRepo: Repository<BankAccount>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
    private gmail: GmailService,
  ) {}

  async syncAndFind(userId: string): Promise<{ receipts: ReceiptListItem[]; syncError: string | null }> {
    const existing = await this.receiptRepo.find({ where: { userId } });
    const existingIds = new Set(existing.map((r) => r.gmailMessageId));

    let raw: Awaited<ReturnType<GmailService['fetchAndParseReceipts']>> = [];
    try {
      raw = await this.gmail.fetchAndParseReceipts(userId);
    } catch (err) {
      // Gmail not connected or fetch failed — return cached results plus the reason, so the UI can surface it
      const message = (err as Error)?.message ?? 'Unknown error';
      this.logger.error(`fetchAndParseReceipts failed for user ${userId}: ${message}`, (err as Error)?.stack);
      return { receipts: await this.withMatchStatus(userId, existing), syncError: message };
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

    const receipts = await this.receiptRepo.find({ where: { userId }, order: { parsedAt: 'DESC' } });
    return { receipts: await this.withMatchStatus(userId, receipts), syncError: null };
  }

  /** Annotates receipts with match status by loading every linked transaction for this
      user once and grouping by receiptId — avoids one query per receipt. When a receipt
      has more than one linked transaction (e.g. a multi-category "Create Transactions"
      import), the highest-amount one represents it for display. */
  private async withMatchStatus(userId: string, receipts: Receipt[]): Promise<ReceiptListItem[]> {
    const linkedTxs = await this.txRepo.find({
      where: { userId, receiptId: Not(IsNull()) },
      relations: ['categoryRef'],
      order: { amount: 'DESC' },
    });

    const byReceiptId = new Map<string, Transaction[]>();
    for (const tx of linkedTxs) {
      if (!tx.receiptId) continue;
      const list = byReceiptId.get(tx.receiptId) ?? [];
      list.push(tx);
      byReceiptId.set(tx.receiptId, list);
    }

    return receipts.map((receipt) => {
      const linked = byReceiptId.get(receipt.id) ?? [];
      const top = linked[0] ?? null;
      const matchedTransaction: MatchedTransaction | null = top
        ? {
            id: top.id,
            name: top.name,
            amount: Number(top.amount),
            date: top.date,
            category: top.categoryRef
              ? { id: top.categoryRef.id, name: top.categoryRef.name, icon: top.categoryRef.icon, color: top.categoryRef.color }
              : null,
          }
        : null;
      return {
        ...receipt,
        matchStatus: (linked.length > 0 ? 'matched' : 'pending') as MatchStatus,
        matchedTransaction,
      };
    });
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

      // Validate ownership of any referenced ids before creating the transaction,
      // so a caller can't attach their receipt to another user's account/category.
      if (split.bankAccountId) {
        const acc = await this.accountRepo.findOneBy({ id: split.bankAccountId });
        if (!acc || acc.userId !== userId) throw new ForbiddenException();
      }
      if (split.categoryId) {
        const cat = await this.categoryRepo.findOneBy({ id: split.categoryId });
        if (!cat || cat.userId !== userId) throw new ForbiddenException();
      }

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
