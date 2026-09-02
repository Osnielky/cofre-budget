import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversation } from './ai-conversation.entity';
import { AiMessage } from './ai-message.entity';
import { AiPendingAction } from './ai-pending-action.entity';
import { AiConversationsService } from './ai-conversations.service';
import { AiConversationsController } from './ai-conversations.controller';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { NetWorthGoalModule } from '../net-worth-goal/net-worth-goal.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { DebtsModule } from '../debts/debts.module';
import { AiReadToolsService } from './ai-read-tools.service';
import { Category } from '../categories/category.entity';
import { AiProposeToolsService } from './ai-propose-tools.service';
import { AiActionsService } from './ai-actions.service';
import { AiActionsController } from './ai-actions.controller';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiConversation, AiMessage, AiPendingAction, Transaction, Category]),
    TransactionsModule, CategoriesModule, BudgetsModule, NetWorthGoalModule, BankAccountsModule, DebtsModule,
  ],
  providers: [AiConversationsService, AiReadToolsService, AiProposeToolsService, AiActionsService, AiChatService],
  controllers: [AiConversationsController, AiActionsController, AiChatController],
  exports: [AiConversationsService],
})
export class AiAgentModule {}
