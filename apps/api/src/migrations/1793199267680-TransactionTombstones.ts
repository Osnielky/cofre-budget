import { MigrationInterface, QueryRunner } from "typeorm";

export class TransactionTombstones1793199267680 implements MigrationInterface {
    name = 'TransactionTombstones1793199267680'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "transaction_tombstones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "transactionId" uuid NOT NULL, "bankAccountId" uuid, "externalId" character varying, "reason" character varying NOT NULL, "payload" text NOT NULL, "removedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fd4e59c1c1021c8ab3c6945896d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_29fe45cc44724f97ccfe2a4343" ON "transaction_tombstones" ("userId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_29fe45cc44724f97ccfe2a4343"`);
        await queryRunner.query(`DROP TABLE "transaction_tombstones"`);
    }

}
