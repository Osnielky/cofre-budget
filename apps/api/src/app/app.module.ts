import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../config/database.config';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { PlaidModule } from '../plaid/plaid.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
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
  ],
})
export class AppModule {}
