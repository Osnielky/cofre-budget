import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { DebtsModule } from '../debts/debts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount, ProjectCategory]), DebtsModule],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
