import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountsController } from './bank-accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, Transaction, PlaidItem])],
  providers: [BankAccountsService],
  controllers: [BankAccountsController],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
