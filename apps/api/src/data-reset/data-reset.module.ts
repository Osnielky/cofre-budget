import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { Project } from '../projects/project.entity';
import { ProjectCategory } from '../projects/project-category.entity';
import { BankAccount } from '../bank-accounts/bank-account.entity';
import { Budget } from '../budgets/budget.entity';
import { DataResetService } from './data-reset.service';
import { DataResetController } from './data-reset.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Category, Project, ProjectCategory, BankAccount, Budget])],
  controllers: [DataResetController],
  providers: [DataResetService],
})
export class DataResetModule {}
