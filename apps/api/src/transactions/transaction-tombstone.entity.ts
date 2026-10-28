import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A copy of a transaction the app deleted on its own, not at the user's request.
 * Today the only writer is the Plaid sync, when Plaid reports a transaction as
 * removed: an institution migration can retract a whole account's history in one
 * webhook, and before this table that history was simply gone. The row keeps the
 * original id and the full column payload so it can be put back verbatim.
 * Never written for deletions the user makes in the UI.
 */
@Entity('transaction_tombstones')
export class TransactionTombstone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  /** The deleted transaction's own id, so a restore can reuse it (split parents keep their children). */
  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalId: string | null;

  /** Why the app removed it: 'plaid_removed' (Plaid's removed[] list), 'plaid_removed_child' (a split child that followed its parent). */
  @Column({ type: 'varchar' })
  reason: string;

  /** Every column of the transaction row as it was, including relations by id.
   *  simple-json (text) rather than jsonb so the sqlite test suites can build it. */
  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  removedAt: Date;
}
