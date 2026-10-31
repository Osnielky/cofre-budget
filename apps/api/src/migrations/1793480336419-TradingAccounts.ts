import { MigrationInterface, QueryRunner } from "typeorm";

export class TradingAccounts1793480336419 implements MigrationInterface {
    name = 'TradingAccounts1793480336419'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "tradingAccountId" uuid`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "kind" character varying(16) NOT NULL DEFAULT 'broker'`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "status" character varying(16) NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "firm" character varying(80)`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "accountSize" numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "startedAt" date`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "endedAt" date`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD "notes" text`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_3e877c5a5594a2a0a09001e6cd6" FOREIGN KEY ("tradingAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_3e877c5a5594a2a0a09001e6cd6"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "notes"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "endedAt"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "startedAt"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "accountSize"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "firm"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP COLUMN "kind"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "tradingAccountId"`);
    }

}
