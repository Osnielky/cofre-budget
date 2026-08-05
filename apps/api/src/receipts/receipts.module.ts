import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receipt } from './receipt.entity';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Category } from '../categories/category.entity';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { GmailModule } from '../gmail/gmail.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Receipt, Transaction, BankAccount, Category]), GmailModule, TransactionsModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
