import { MigrationInterface, QueryRunner } from "typeorm";

export class NetWorthSnapshots1790968124309 implements MigrationInterface {
    name = 'NetWorthSnapshots1790968124309'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "net_worth_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "date" date NOT NULL, "value" numeric(14,2) NOT NULL, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c8fa90bccd2310ccf90e3788287" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f1cbcb3967cc25f5b3efc07fec" ON "net_worth_snapshots" ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c081669aa5cb9f072ce7549fcd" ON "net_worth_snapshots" ("userId", "date") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c081669aa5cb9f072ce7549fcd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1cbcb3967cc25f5b3efc07fec"`);
        await queryRunner.query(`DROP TABLE "net_worth_snapshots"`);
    }

}
