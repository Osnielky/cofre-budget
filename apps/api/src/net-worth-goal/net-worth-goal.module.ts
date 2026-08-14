import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { DebtsModule } from '../debts/debts.module';
import { NetWorthGoalService } from './net-worth-goal.service';
import { NetWorthGoalController } from './net-worth-goal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), BankAccountsModule, DebtsModule],
  providers: [NetWorthGoalService],
  controllers: [NetWorthGoalController],
  exports: [NetWorthGoalService],
})
export class NetWorthGoalModule {}
