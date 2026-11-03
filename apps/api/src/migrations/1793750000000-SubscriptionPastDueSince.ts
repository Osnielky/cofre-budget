import { MigrationInterface, QueryRunner } from "typeorm";

/* Clock for the 24-hour past-due downgrade. Rows already past due start their
   clock at their last update so they are not all dropped the instant this ships. */
export class SubscriptionPastDueSince1793750000000 implements MigrationInterface {
    name = 'SubscriptionPastDueSince1793750000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD "pastDueSince" TIMESTAMP`);
        await queryRunner.query(`UPDATE "subscriptions" SET "pastDueSince" = "updatedAt" WHERE "status" = 'past_due'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "pastDueSince"`);
    }

}
