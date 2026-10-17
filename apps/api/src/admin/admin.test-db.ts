import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Budget } from '../budgets/budget.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

/** In-memory sqlite with every table AdminService reads. Test-only. */
export async function makeDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true,
    entities: [User, Subscription, PlaidItem, Transaction, Category, BankAccount, Budget, Project, ProjectCategory, CategorizationRule],
  });
  await ds.initialize();
  // ai_conversations / ai_messages / receipts use jsonb, which sqlite rejects;
  // AdminService reads them by table name, so minimal stand-ins are enough.
  await ds.query('CREATE TABLE ai_conversations (id varchar PRIMARY KEY, "userId" varchar, "createdAt" datetime)');
  await ds.query('CREATE TABLE ai_messages (id varchar PRIMARY KEY, "conversationId" varchar, "createdAt" datetime)');
  await ds.query('CREATE TABLE receipts (id varchar PRIMARY KEY, "userId" varchar, "createdAt" datetime)');
  return ds;
}
