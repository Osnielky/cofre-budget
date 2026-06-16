import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Debt } from './debt.entity';
import { DebtPayment } from './debt-payment.entity';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Debt, DebtPayment]), MailModule],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
