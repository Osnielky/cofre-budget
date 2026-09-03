import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { AiPendingAction } from './ai-pending-action.entity';
import { AiConversation } from './ai-conversation.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { AiActionsService } from './ai-actions.service';

async function makeDataSource() {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true,
    // Transaction has @ManyToOne relations to BankAccount, Category, and
    // ProjectCategory — TypeORM requires every entity referenced by a relation
    // to be registered, even though this test never touches most of them.
    // AiPendingAction/AiConversation are deliberately NOT registered here: their
    // `jsonb` columns aren't supported by the better-sqlite3 driver, so they're
    // backed by the in-memory fake repos below instead.
    entities: [User, Transaction, Category, BankAccount, ProjectCategory, CategorizationRule],
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

/** Minimal in-memory stand-in for the subset of Repository<T> that
 * AiActionsService.confirm()/owned() actually calls: findOneBy + save. */
function makeFakeRepo<T extends { id: string }>() {
  const rows = new Map<string, T>();
  let seq = 0;
  return {
    rows,
    create: (partial: Partial<T>) => ({ id: `fake-${++seq}`, ...partial }) as T,
    findOneBy: async (where: Partial<T>) => {
      for (const row of rows.values()) {
        if (Object.entries(where).every(([k, v]) => (row as any)[k] === v)) return row;
      }
      return null;
    },
    save: async (row: T) => { rows.set(row.id, row); return row; },
  };
}

// AiActionsService's real constructor order: (actions, conversations, txRepo,
// categoryRepo, transactions, categories, budgets, netWorthGoal) — read
// ai-actions.service.ts:19-29 before touching this. Only `transactions` is
// exercised by the categorize_transactions branch under test here, so the
// other three collaborator services are stubbed out.
function makeService(
  ds: Awaited<ReturnType<typeof makeDataSource>>,
  actionsRepo: ReturnType<typeof makeFakeRepo<AiPendingAction>>,
  conversationsRepo: ReturnType<typeof makeFakeRepo<AiConversation>>,
  updateCategory: ReturnType<typeof vi.fn>,
) {
  return new AiActionsService(
    actionsRepo as any,
    conversationsRepo as any,
    ds.getRepository(Transaction),
    ds.getRepository(Category),
    { updateCategory } as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('AiActionsService.confirm — categorize_transactions', () => {
  let ds: Awaited<ReturnType<typeof makeDataSource>>;
  let actionsRepo: ReturnType<typeof makeFakeRepo<AiPendingAction>>;
  let conversationsRepo: ReturnType<typeof makeFakeRepo<AiConversation>>;
  let userId: string;
  let conversationId: string;
  let categoryId: string;

  beforeEach(async () => {
    ds = await makeDataSource();
    actionsRepo = makeFakeRepo<AiPendingAction>();
    conversationsRepo = makeFakeRepo<AiConversation>();

    const user = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'a@example.com' }));
    userId = user.id;
    const category = await ds.getRepository(Category).save(
      ds.getRepository(Category).create({ userId, name: 'Dining', type: 'expense', icon: '🍔', color: '#F07A3E' }),
    );
    categoryId = category.id;
    const conversation = await conversationsRepo.save(conversationsRepo.create({ userId } as any));
    conversationId = conversation.id;
  });

  async function makeTx(overrides: Partial<Transaction> = {}) {
    return ds.getRepository(Transaction).save(ds.getRepository(Transaction).create({
      userId, amount: -10, name: 'Coffee', date: '2026-08-01', ...overrides,
    }));
  }

  async function makeAction(transactionIds: string[]) {
    return actionsRepo.save(actionsRepo.create({
      conversationId, type: 'categorize_transactions',
      payload: { transactionIds, categoryId },
      status: 'pending',
    } as any));
  }

  function makeConfirmService(updateCategory: ReturnType<typeof vi.fn>) {
    return makeService(ds, actionsRepo, conversationsRepo, updateCategory);
  }

  it('applies the categorization to an ordinary, not-debt-linked transaction', async () => {
    const tx = await makeTx();
    const action = await makeAction([tx.id]);
    const updateCategory = vi.fn().mockResolvedValue({});
    const service = makeConfirmService(updateCategory);

    const { action: resolved, resultText } = await service.confirm(action.id, userId);

    expect(updateCategory).toHaveBeenCalledWith(tx.id, userId, categoryId);
    expect(resultText).toBe('Categorized 1 of 1 transaction.');
    expect(resolved.status).toBe('confirmed');
    expect(resolved.undoPayload!.transactions).toEqual([{ transactionId: tx.id, previousCategoryId: null }]);
  });

  it('skips a transaction that became debt-linked after the proposal was made (re-checked at confirm time)', async () => {
    // Not debt-linked when proposed...
    const tx = await makeTx({ debtId: null });
    const action = await makeAction([tx.id]);
    // ...but debt-linked by the time confirm() runs (e.g. via the Debts UI, unrelated to this AI flow).
    await ds.getRepository(Transaction).update(tx.id, { debtId: 'debt-1' });

    const updateCategory = vi.fn().mockResolvedValue({});
    const service = makeConfirmService(updateCategory);

    const { action: resolved, resultText } = await service.confirm(action.id, userId);

    expect(updateCategory).not.toHaveBeenCalled();
    expect(resultText).toBe('Categorized 0 of 1 transaction.');
    expect(resolved.status).toBe('confirmed'); // still resolves the action — just applies nothing
    expect(resolved.undoPayload!.transactions).toEqual([]); // not added to the undo snapshot either
  });

  it('applies eligible transactions and skips only the debt-linked one in a mixed batch', async () => {
    const eligible = await makeTx();
    const debtLinked = await makeTx({ debtId: 'debt-1' });
    const action = await makeAction([eligible.id, debtLinked.id]);

    const updateCategory = vi.fn().mockResolvedValue({});
    const service = makeConfirmService(updateCategory);

    const { resultText } = await service.confirm(action.id, userId);

    expect(updateCategory).toHaveBeenCalledTimes(1);
    expect(updateCategory).toHaveBeenCalledWith(eligible.id, userId, categoryId);
    expect(resultText).toBe('Categorized 1 of 2 transactions.');
  });

  it('still skips a transaction that vanished since the proposal (pre-existing behavior, unaffected by the debt re-check)', async () => {
    const action = await makeAction(['00000000-0000-0000-0000-000000000000']);
    const updateCategory = vi.fn().mockResolvedValue({});
    const service = makeConfirmService(updateCategory);

    const { resultText } = await service.confirm(action.id, userId);

    expect(updateCategory).not.toHaveBeenCalled();
    expect(resultText).toBe('Categorized 0 of 1 transaction.');
  });
});
