import { fromCents } from './money';
import type { BudgetSource, Drafts } from './calculations';

export interface BatchItemPayload { id?: string; categoryId?: string; amount: number }

export interface BatchPayload { month: string; items: BatchItemPayload[] }

/** Turns drafts into the PUT /budgets/batch body. Unbudgeted rows left at $0
    are skipped (nothing to create); invalid values are reported, not sent. */
export function buildBatchPayload(
  month: string, sources: BudgetSource[], drafts: Drafts,
): { payload: BatchPayload; invalid: string[] } {
  const items: BatchItemPayload[] = [];
  const invalid: string[] = [];
  for (const s of sources) {
    if (!(s.key in drafts)) continue;
    const cents = drafts[s.key];
    if (!Number.isInteger(cents) || cents < 0) { invalid.push(s.name); continue; }
    if (s.budgetId) items.push({ id: s.budgetId, amount: fromCents(cents) });
    else if (s.categoryId && cents > 0) items.push({ categoryId: s.categoryId, amount: fromCents(cents) });
  }
  return { payload: { month, items }, invalid };
}

export type SaveResult = { ok: true; saved: number } | { ok: false; error: string };

/** Sends the batch. Never throws: network and server errors come back as
    `{ ok: false }` so the caller can keep the draft intact. */
export async function saveBudgetBatch(
  api: string, payload: BatchPayload, fetchImpl: typeof fetch = fetch,
): Promise<SaveResult> {
  if (payload.items.length === 0) return { ok: true, saved: 0 };
  try {
    const res = await fetchImpl(`${api}/budgets/batch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = `Save failed (${res.status})`;
      try {
        const body = await res.json();
        const m = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
        if (typeof m === 'string' && m) msg = m;
      } catch { /* non-JSON error body */ }
      return { ok: false, error: msg };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, saved: typeof body?.saved === 'number' ? body.saved : payload.items.length };
  } catch {
    return { ok: false, error: 'Network error — your changes are still here. Try again.' };
  }
}
