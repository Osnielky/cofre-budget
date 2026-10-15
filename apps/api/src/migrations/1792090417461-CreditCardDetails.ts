import { MigrationInterface, QueryRunner } from "typeorm";

export class CreditCardDetails1792090417461 implements MigrationInterface {
    name = 'CreditCardDetails1792090417461'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "credit_card_details" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "bankAccountId" uuid NOT NULL, "creditLimit" numeric(12,2), "officialName" character varying, "aprs" text, "lastStatementBalance" numeric(12,2), "lastStatementDate" date, "minimumPayment" numeric(12,2), "nextPaymentDueDate" date, "lastPaymentAmount" numeric(12,2), "lastPaymentDate" date, "isOverdue" boolean, "promoAprEndsOn" date, "rewardsBalance" numeric(12,2), "liabilitiesStatus" character varying NOT NULL DEFAULT 'pending', "manualFields" text, "manualEditedAt" TIMESTAMP, "plaidData" text, "liabilitiesSyncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e9b5c2ff2ea0dec1e0e1e5b52ac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_df48f74e36aff4f31eba356594" ON "credit_card_details" ("bankAccountId") `);
        await queryRunner.query(`CREATE TABLE "card_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "goal" character varying, "annualFeeOk" boolean, "creditScoreBand" character varying, "monthlyDebtBudget" numeric(12,2), "plannedPurchaseAmount" numeric(12,2), "plannedPurchaseNote" character varying(120), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e504d2f8f193c47c38c212c180d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5f12d2b247d56064f8219c515a" ON "card_profiles" ("userId") `);
        await queryRunner.query(`ALTER TABLE "credit_card_details" ADD CONSTRAINT "FK_ad924bf6c95290141e071eff70f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "credit_card_details" ADD CONSTRAINT "FK_df48f74e36aff4f31eba356594e" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "card_profiles" ADD CONSTRAINT "FK_5f12d2b247d56064f8219c515a1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "card_profiles" DROP CONSTRAINT "FK_5f12d2b247d56064f8219c515a1"`);
        await queryRunner.query(`ALTER TABLE "credit_card_details" DROP CONSTRAINT "FK_df48f74e36aff4f31eba356594e"`);
        await queryRunner.query(`ALTER TABLE "credit_card_details" DROP CONSTRAINT "FK_ad924bf6c95290141e071eff70f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5f12d2b247d56064f8219c515a"`);
        await queryRunner.query(`DROP TABLE "card_profiles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_df48f74e36aff4f31eba356594"`);
        await queryRunner.query(`DROP TABLE "credit_card_details"`);
    }

}
