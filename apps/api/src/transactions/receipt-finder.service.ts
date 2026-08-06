import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Receipt } from '../receipts/receipt.entity';
import { Transaction } from './transaction.entity';
import { GmailService } from '../gmail/gmail.service';

export interface ReceiptCandidate {
  id: string;
  gmailMessageId: string;
  merchant: string;
  orderNumber: string | null;
  orderDate: string | null;
  total: number;
  currency: string;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  rawSubject: string | null;
  amountDelta: number;
  source: 'cache' | 'gmail';
  linked: boolean;
}

export interface TransactionCandidate {
  id: string;
  name: string;
  date: string;
  amount: number;
  amountDelta: number;
  linked: boolean;
}

/** tx.name → Gmail search term. First alias hit wins; fallback = first word ≥ 4 letters. */
const MERCHANT_ALIASES: [RegExp, string][] = [
  [/\bAMZN\b|\bAMAZON\b/i, 'amazon.com'],
  [/\bWAL-?MART\b/i, 'walmart.com'],
  [/\bAPPLE(\.COM)?\b/i, 'apple.com'],
  [/\bDOORDASH\b|^DD\s?\*/i, 'doordash.com'],
  [/\bUBER\s*EATS\b/i, 'ubereats.com'],
];

export function merchantTerm(txName: string): string {
  for (const [re, term] of MERCHANT_ALIASES) if (re.test(txName)) return term;
  const cleaned = txName.replace(/\*\S*/g, ' ');
  const token = cleaned.split(/\s+/).find((w) => w.replace(/[^a-z]/gi, '').length >= 4);
  return (token ?? txName.trim().split(/\s+/)[0] ?? '').toLowerCase();
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ReceiptFinderService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    private gmail: GmailService,
  ) {}

  async findCandidates(userId: string, txId: string, windowDays = 4): Promise<ReceiptCandidate[]> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException('Transaction not found');

    const absAmount = Math.abs(Number(tx.amount));
    const from = shiftDate(tx.date, -windowDays);
    const to = shiftDate(tx.date, windowDays);

    // 1) Local cache first — instant when the receipt was parsed before.
    const cached = await this.receiptRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .andWhere('(r.orderDate BETWEEN :from AND :to OR r.orderDate IS NULL)', { from, to })
      .getMany();

    if (cached.length > 0) {
      return this.rank(cached, tx, absAmount, 'cache');
    }

    // 2) Gmail fallback.
    const conn = await this.gmail.getConnection(userId);
    if (!conn) throw new ConflictException('gmail_not_connected');

    const query = `${merchantTerm(tx.name)} after:${from} before:${shiftDate(to, 1)}`;
    const raw = await this.gmail.searchReceipts(userId, query, 10);

    for (const r of raw) {
      const validItems = (r.items ?? []).filter(
        (i) =>
          typeof i.name === 'string' && typeof i.quantity === 'number' &&
          typeof i.unitPrice === 'number' && typeof i.total === 'number',
      );
      await this.receiptRepo.upsert(
        {
          userId,
          gmailMessageId: r.gmailMessageId,
          merchant: r.merchant,
          orderNumber: r.orderNumber ?? undefined,
          orderDate: r.orderDate ?? undefined,
          total: r.total,
          currency: r.currency,
          items: validItems,
          rawSubject: r.subject,
        },
        ['userId', 'gmailMessageId'],
      );
    }

    const fresh = raw.length
      ? await this.receiptRepo
          .createQueryBuilder('r')
          .where('r.userId = :userId', { userId })
          .andWhere('r.gmailMessageId IN (:...ids)', { ids: raw.map((r) => r.gmailMessageId) })
          .getMany()
      : [];
    return this.rank(fresh, tx, absAmount, 'gmail');
  }

  /** Row-indicator support: which of the user's unlinked transactions have at least one
      cached receipt in their date window — local-cache-only, no Gmail calls, so it's cheap
      enough to run for every row at once instead of per-transaction on demand. */
  async findCachedMatchIds(userId: string, windowDays = 4): Promise<string[]> {
    const txs = await this.txRepo.find({ where: { userId, isSplitParent: false, receiptId: IsNull() } });
    if (txs.length === 0) return [];

    const receipts = await this.receiptRepo.find({ where: { userId } });
    if (receipts.length === 0) return [];

    const matched: string[] = [];
    for (const tx of txs) {
      const from = shiftDate(tx.date, -windowDays);
      const to = shiftDate(tx.date, windowDays);
      const hasCandidate = receipts.some((r) => !r.orderDate || (r.orderDate >= from && r.orderDate <= to));
      if (hasCandidate) matched.push(tx.id);
    }
    return matched;
  }

  async findTransactionCandidates(
    userId: string, receiptId: string, windowDays = 4,
  ): Promise<TransactionCandidate[]> {
    const receipt = await this.receiptRepo.findOneBy({ id: receiptId, userId });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const absTotal = Math.abs(Number(receipt.total));
    const from = receipt.orderDate ? shiftDate(receipt.orderDate, -windowDays) : null;
    const to = receipt.orderDate ? shiftDate(receipt.orderDate, windowDays) : null;

    const qb = this.txRepo.createQueryBuilder('t').where('t.userId = :userId', { userId });
    if (from && to) {
      qb.andWhere('(t.date BETWEEN :from AND :to OR t.receiptId = :receiptId)', { from, to, receiptId });
    }
    // Exclude transactions already linked to a *different* receipt.
    qb.andWhere('(t.receiptId IS NULL OR t.receiptId = :receiptId)', { receiptId });
    const candidates = await qb.getMany();

    return this.rankTransactions(candidates, receipt, absTotal);
  }

  /* The already-linked receipt is always surfaced (prepended even when outside the window). */
  private async rank(
    receipts: Receipt[], tx: Transaction, absAmount: number, source: 'cache' | 'gmail',
  ): Promise<ReceiptCandidate[]> {
    if (tx.receiptId && !receipts.some((r) => r.id === tx.receiptId)) {
      const linked = await this.receiptRepo.findOneBy({ id: tx.receiptId, userId: tx.userId });
      if (linked) receipts = [linked, ...receipts];
    }

    const txTime = new Date(`${tx.date}T00:00:00Z`).getTime();
    const dateDist = new Map(receipts.map((r) => [
      r.id,
      r.orderDate ? Math.abs(new Date(`${r.orderDate}T00:00:00Z`).getTime() - txTime) : Number.MAX_SAFE_INTEGER,
    ]));

    return receipts
      .map((r) => ({
        id: r.id,
        gmailMessageId: r.gmailMessageId,
        merchant: r.merchant,
        orderNumber: r.orderNumber ?? null,
        orderDate: r.orderDate ?? null,
        total: Number(r.total),
        currency: r.currency,
        items: r.items ?? [],
        rawSubject: r.rawSubject ?? null,
        amountDelta: +Math.abs(Number(r.total) - absAmount).toFixed(2),
        source,
        linked: r.id === tx.receiptId,
      }))
      .sort((a, b) =>
        Number(b.linked) - Number(a.linked) ||
        a.amountDelta - b.amountDelta ||
        (dateDist.get(a.id) ?? 0) - (dateDist.get(b.id) ?? 0),
      );
  }

  private rankTransactions(txs: Transaction[], receipt: Receipt, absTotal: number): TransactionCandidate[] {
    const receiptTime = receipt.orderDate ? new Date(`${receipt.orderDate}T00:00:00Z`).getTime() : null;
    const dateDist = new Map(txs.map((t) => [
      t.id,
      receiptTime !== null ? Math.abs(new Date(`${t.date}T00:00:00Z`).getTime() - receiptTime) : Number.MAX_SAFE_INTEGER,
    ]));

    return txs
      .map((t) => ({
        id: t.id,
        name: t.name,
        date: t.date,
        amount: Number(t.amount),
        amountDelta: +Math.abs(Math.abs(Number(t.amount)) - absTotal).toFixed(2),
        linked: t.receiptId === receipt.id,
      }))
      .sort((a, b) =>
        Number(b.linked) - Number(a.linked) ||
        a.amountDelta - b.amountDelta ||
        (dateDist.get(a.id) ?? 0) - (dateDist.get(b.id) ?? 0),
      );
  }

  async linkReceipt(userId: string, txId: string, receiptId: string | null): Promise<Transaction> {
    const tx = await this.txRepo.findOneBy({ id: txId, userId });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (receiptId) {
      // IDOR guard: the receipt must belong to the caller.
      const receipt = await this.receiptRepo.findOneBy({ id: receiptId });
      if (!receipt || receipt.userId !== userId) throw new ForbiddenException();
    }
    tx.receiptId = receiptId;
    return this.txRepo.save(tx);
  }
}
