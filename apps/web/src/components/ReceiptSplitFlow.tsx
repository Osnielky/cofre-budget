'use client';

import { useState } from 'react';
import FindReceiptModal from './FindReceiptModal';
import SplitTransactionModal from './SplitTransactionModal';

interface Category { id: string; name: string; icon: string; color: string; type: string }
interface Transaction {
  id: string; name: string; amount: number; date: string;
  categoryId: string | null; bankAccountId: string;
  parentId: string | null; isSplitParent: boolean;
  receiptId: string | null;
}
interface SplitLine { categoryId: string; amount: string }

interface Props {
  tx: Transaction;
  categories: Category[];
  /** A link/unlink happened but nothing closed — refresh the transaction list quietly in the background. */
  onDataChanged: () => void;
  /** Split completed — parent should reload and close the whole flow. */
  onSaved: (children: unknown[]) => void;
  onClose: () => void;
}

/** Owns the find-receipt → split-from-items handoff as one component with local state,
    instead of the page juggling two independently-gated modals over a shared, mutable
    `tx` reference — `tx` here is a stable prop for the lifetime of this component. */
export default function ReceiptSplitFlow({ tx, categories, onDataChanged, onSaved, onClose }: Props) {
  const [initialLines, setInitialLines] = useState<SplitLine[] | null>(null);

  if (initialLines) {
    return (
      <SplitTransactionModal
        tx={tx}
        categories={categories}
        initialLines={initialLines}
        onSave={onSaved}
        onClose={onClose}
      />
    );
  }

  return (
    <FindReceiptModal
      tx={tx}
      onLinked={onDataChanged}
      onSplitFromItems={setInitialLines}
      onClose={onClose}
    />
  );
}
