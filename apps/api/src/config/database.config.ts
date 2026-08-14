import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { Budget } from '../budgets/budget.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Debt } from '../debts/debt.entity';
import { DebtPayment } from '../debts/debt-payment.entity';
import { ConnectedApp } from '../connected-apps/connected-app.entity';
import { Receipt } from '../receipts/receipt.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { AiConversation } from '../ai-agent/ai-conversation.entity';
import { AiMessage } from '../ai-agent/ai-message.entity';
import { AiPendingAction } from '../ai-agent/ai-pending-action.entity';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'postgres',
  database: process.env.DB_NAME ?? 'cofre_budget',
  entities: [User, BankAccount, PlaidItem, Transaction, Category, Budget, Project, ProjectCategory, Debt, DebtPayment, ConnectedApp, Receipt, CategorizationRule, AiConversation, AiMessage, AiPendingAction],
  synchronize: true,
  logging: false,
  ssl: (() => {
    if (!process.env.DB_HOST?.includes('supabase.co')) return false;
    const caPath = ['supabase-ca.crt.crt', 'supabase-ca.crt'].map(f => path.resolve(process.cwd(), f)).find(p => fs.existsSync(p)) ?? '';
    if (caPath) return { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
    return { rejectUnauthorized: false };
  })(),
}));
