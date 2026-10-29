import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount])],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
