import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { Receipt } from '../receipts/receipt.entity';
import { TransactionsService } from './transactions.service';
import { ReceiptFinderService } from './receipt-finder.service';
import { TransactionsController } from './transactions.controller';
import { DebtsModule } from '../debts/debts.module';
import { GmailModule } from '../gmail/gmail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount, ProjectCategory, Receipt]), DebtsModule, GmailModule],
  providers: [TransactionsService, ReceiptFinderService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
