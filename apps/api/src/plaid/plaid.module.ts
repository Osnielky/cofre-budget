import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaidItem } from './plaid-item.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionTombstone } from '../transactions/transaction-tombstone.entity';
import { User } from '../users/user.entity';
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';
import { PlaidWebhookController } from './plaid-webhook.controller';
import { PlaidWebhookVerifierService } from './plaid-webhook-verifier.service';
import { PlaidSweepService } from './plaid-sweep.service';
import { PlaidSweepController } from './plaid-sweep.controller';
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';
import { CardsModule } from '../cards/cards.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction, TransactionTombstone, User]), CategorizationRulesModule, CardsModule],
  providers: [PlaidService, PlaidWebhookVerifierService, PlaidSweepService],
  controllers: [PlaidController, PlaidWebhookController, PlaidSweepController],
  exports: [PlaidService],
})
export class PlaidModule {}
