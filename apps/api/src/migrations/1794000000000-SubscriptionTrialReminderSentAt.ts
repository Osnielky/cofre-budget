import { MigrationInterface, QueryRunner } from "typeorm";

/* Once-only stamp for Cofre's "your trial ends in 3 days" email
   (BillingService.sweepTrialReminders). Stripe's own trial reminder is off
   because a late-payment extension is a Stripe trial internally. */
export class SubscriptionTrialReminderSentAt1794000000000 implements MigrationInterface {
    name = 'SubscriptionTrialReminderSentAt1794000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD "trialReminderSentAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "trialReminderSentAt"`);
    }

}
