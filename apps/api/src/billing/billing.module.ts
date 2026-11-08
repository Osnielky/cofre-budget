import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';
import { BillingService } from './billing.service';
import { StripeWebhookVerifierService } from './stripe-webhook-verifier.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingSweepController } from './billing-sweep.controller';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Subscription]), MailModule, UsersModule],
  providers: [BillingService, StripeWebhookVerifierService],
  controllers: [BillingController, BillingWebhookController, BillingSweepController],
  exports: [BillingService],
})
export class BillingModule {}
