import { MigrationInterface, QueryRunner } from "typeorm";

export class InvestmentActivityFields1793296759537 implements MigrationInterface {
    name = 'InvestmentActivityFields1793296759537'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "project_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "projectId" uuid NOT NULL, "bankAccountId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c08fe35b2304c2f5f605d9a9e90" UNIQUE ("bankAccountId"), CONSTRAINT "PK_b0f5c6d1b04a4258a2a2cdb0040" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0d33038c899aae2a1340c47b0a" ON "project_accounts" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6b76f6d1cc7a979c34d5a1e7c3" ON "project_accounts" ("projectId") `);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "symbol" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "securityName" character varying(120)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "quantity" numeric(18,6)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "price" numeric(18,6)`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "fees" numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD CONSTRAINT "FK_6b76f6d1cc7a979c34d5a1e7c37" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_accounts" ADD CONSTRAINT "FK_c08fe35b2304c2f5f605d9a9e90" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP CONSTRAINT "FK_c08fe35b2304c2f5f605d9a9e90"`);
        await queryRunner.query(`ALTER TABLE "project_accounts" DROP CONSTRAINT "FK_6b76f6d1cc7a979c34d5a1e7c37"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "fees"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "securityName"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "symbol"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6b76f6d1cc7a979c34d5a1e7c3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0d33038c899aae2a1340c47b0a"`);
        await queryRunner.query(`DROP TABLE "project_accounts"`);
    }

}
