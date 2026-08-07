import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction]), CategorizationRulesModule],
  providers: [PlaidService],
  controllers: [PlaidController],
  exports: [PlaidService],
})
export class PlaidModule {}
