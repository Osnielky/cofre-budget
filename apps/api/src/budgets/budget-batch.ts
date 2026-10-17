import { BadRequestException } from '@nestjs/common';

/** One row of a batch save: update an existing budget by id, or create a
    spending budget for a category that has none this month. */
export type BatchItem =
  | { kind: 'update'; id: string; amount: number }
  | { kind: 'create'; categoryId: string; amount: number };

export interface BatchRequest { month: string; items: BatchItem[] }

export const MAX_BATCH_ITEMS = 200;
const MAX_AMOUNT = 9_999_999_999.99; // decimal(12,2)
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Amounts arrive as numbers or numeric strings; anything that isn't a finite,
    non-negative value with at most 2 decimals is rejected (never rounded). */
export function parseAmount(raw: unknown): number | null {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return null;
  const cents = Math.round(n * 100);
  if (Math.abs(cents - n * 100) > 1e-6) return null;
  return cents / 100;
}

/** Validates and normalizes a raw batch body. Throws BadRequestException
    describing the first invalid field. */
export function parseBatchBody(body: unknown): BatchRequest {
  if (!body || typeof body !== 'object') throw new BadRequestException('Body must be an object');
  const { month, items } = body as { month?: unknown; items?: unknown };
  if (typeof month !== 'string' || !MONTH_RE.test(month)) throw new BadRequestException('month must be YYYY-MM');
  if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('items must be a non-empty array');
  if (items.length > MAX_BATCH_ITEMS) throw new BadRequestException(`At most ${MAX_BATCH_ITEMS} items per batch`);

  const seenIds = new Set<string>();
  const seenCats = new Set<string>();
  const out: BatchItem[] = items.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new BadRequestException(`items[${i}] must be an object`);
    const { id, categoryId, amount } = raw as { id?: unknown; categoryId?: unknown; amount?: unknown };
    const amt = parseAmount(amount);
    if (amt === null) throw new BadRequestException(`items[${i}].amount must be a non-negative amount with at most 2 decimals`);
    if (typeof id === 'string' && id) {
      if (seenIds.has(id)) throw new BadRequestException(`Duplicate budget id ${id}`);
      seenIds.add(id);
      return { kind: 'update', id, amount: amt };
    }
    if (typeof categoryId === 'string' && categoryId) {
      if (seenCats.has(categoryId)) throw new BadRequestException(`Duplicate categoryId ${categoryId}`);
      seenCats.add(categoryId);
      return { kind: 'create', categoryId, amount: amt };
    }
    throw new BadRequestException(`items[${i}] needs an id or a categoryId`);
  });
  return { month, items: out };
}
