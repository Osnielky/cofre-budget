import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { RecurringRule } from './recurring-rule.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Project } from '../projects/project.entity';
import { Receipt } from '../receipts/receipt.entity';
import { TransactionsService } from './transactions.service';
import { RecurringService } from './recurring.service';
import { ReceiptFinderService } from './receipt-finder.service';
import { TransactionsController } from './transactions.controller';
import { DebtsModule } from '../debts/debts.module';
import { GmailModule } from '../gmail/gmail.module';
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, RecurringRule, BankAccount, ProjectCategory, Project, Receipt]), DebtsModule, GmailModule, CategorizationRulesModule],
  providers: [TransactionsService, ReceiptFinderService, RecurringService],
  controllers: [TransactionsController],
  exports: [TransactionsService, ReceiptFinderService, RecurringService],
})
export class TransactionsModule {}
