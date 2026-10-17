import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategorizationRule } from './categorization-rule.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Category } from '../categories/category.entity';
import { CategorizationRulesService } from './categorization-rules.service';
import { CategorizationRulesController } from './categorization-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CategorizationRule, Transaction, Category])],
  providers: [CategorizationRulesService],
  controllers: [CategorizationRulesController],
  exports: [CategorizationRulesService],
})
export class CategorizationRulesModule {}
