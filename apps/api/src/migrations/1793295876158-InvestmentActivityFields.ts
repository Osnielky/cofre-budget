import { MigrationInterface, QueryRunner } from "typeorm";

export class InvestmentActivityFields1793295876158 implements MigrationInterface {
    name = 'InvestmentActivityFields1793295876158'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ADD "symbol" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "securityName" character varying(120)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "quantity" numeric(18,6)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "price" numeric(18,6)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "fees" numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "bankAccountId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "bankAccountId"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "fees"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "securityName"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "symbol"`);
    }

}
