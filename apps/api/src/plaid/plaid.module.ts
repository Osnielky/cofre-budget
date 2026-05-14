import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction])],
  providers: [PlaidService],
  controllers: [PlaidController],
  exports: [PlaidService],
})
export class PlaidModule {}
