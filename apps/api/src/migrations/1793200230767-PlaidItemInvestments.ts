import { MigrationInterface, QueryRunner } from "typeorm";

export class PlaidItemInvestments1793200230767 implements MigrationInterface {
    name = 'PlaidItemInvestments1793200230767'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plaid_items" ADD "investmentsStatus" character varying`);
        await queryRunner.query(`ALTER TABLE "plaid_items" ADD "investmentsSyncedThrough" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plaid_items" DROP COLUMN "investmentsSyncedThrough"`);
        await queryRunner.query(`ALTER TABLE "plaid_items" DROP COLUMN "investmentsStatus"`);
    }

}
