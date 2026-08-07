import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Budget } from '../budgets/budget.entity';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { CategorizationRule } from '../categorization-rules/categorization-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Transaction, Budget, CategorizationRule])],
  providers: [CategoriesService],
  controllers: [CategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}
