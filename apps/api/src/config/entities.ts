// Entities must be listed explicitly: glob paths don't resolve inside the webpack bundle.
import { User } from '../users/user.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { RecurringRule } from '../transactions/recurring-rule.entity';
import { Category } from '../categories/category.entity';
import { Budget } from '../budgets/budget.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { ProjectAccount } from '../projects/project-account.entity';
import { Debt } from '../debts/debt.entity';
import { DebtPayment } from '../debts/debt-payment.entity';
import { ConnectedApp } from '../connected-apps/connected-app.entity';
import { Receipt } from '../receipts/receipt.entity';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';
import { AiConversation } from '../ai-agent/ai-conversation.entity';
import { AiMessage } from '../ai-agent/ai-message.entity';
import { AiPendingAction } from '../ai-agent/ai-pending-action.entity';
import { Subscription } from '../billing/subscription.entity';
import { NetWorthSnapshot } from '../net-worth-goal/net-worth-snapshot.entity';
import { CreditCardDetail } from '../cards/credit-card-detail.entity';
import { CardProfile } from '../cards/card-profile.entity';
import { PageView } from '../analytics/page-view.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { SupportScreenshot } from '../support/support-screenshot.entity';
import { TransactionTombstone } from '../transactions/transaction-tombstone.entity';

export const ENTITIES = [User, BankAccount, PlaidItem, Transaction, RecurringRule, Category, Budget, Project, ProjectCategory, ProjectAccount, Debt, DebtPayment, ConnectedApp, Receipt, CategorizationRule, AiConversation, AiMessage, AiPendingAction, Subscription, NetWorthSnapshot, CreditCardDetail, CardProfile, PageView, SupportTicket, SupportScreenshot,
  TransactionTombstone];
