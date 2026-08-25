import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../config/database.config';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { PlaidModule } from '../plaid/plaid.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { ProjectsModule } from '../projects/projects.module';
import { DebtsModule } from '../debts/debts.module';
import { DataResetModule } from '../data-reset/data-reset.module';
import { GmailModule } from '../gmail/gmail.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module';
import { NetWorthGoalModule } from '../net-worth-goal/net-worth-goal.module';
import { HealthController } from '../health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    // Global rate limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database') as any,
    }),
    UsersModule,
    AuthModule,
    BankAccountsModule,
    PlaidModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    ProjectsModule,
    DebtsModule,
    DataResetModule,
    GmailModule,
    ReceiptsModule,
    CategorizationRulesModule,
    NetWorthGoalModule,
  ],
  controllers: [HealthController],
  providers: [
    // Apply ThrottlerGuard globally — all routes inherit the 100 req/min default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
