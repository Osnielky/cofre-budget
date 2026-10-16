import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { PlaidItem } from '../plaid/plaid-item.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CreditCardDetail } from './credit-card-detail.entity';
import { CardProfile } from './card-profile.entity';
import { CreditCardsService } from './credit-cards.service';
import { CardsController } from './cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditCardDetail, CardProfile, BankAccount, PlaidItem, Transaction])],
  providers: [CreditCardsService],
  controllers: [CardsController],
  exports: [CreditCardsService],
})
export class CardsModule {}
