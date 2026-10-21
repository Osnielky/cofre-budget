import { MigrationInterface, QueryRunner } from "typeorm";

export class SupportTickets1792611889908 implements MigrationInterface {
    name = 'SupportTickets1792611889908'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "support_tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'open', "description" text NOT NULL, "page" character varying(200) NOT NULL, "viewport" character varying(20) NOT NULL DEFAULT 'unknown', "userAgent" character varying(300) NOT NULL DEFAULT '', "screenshotType" character varying(20), "screenshotBytes" integer NOT NULL DEFAULT '0', "reply" text, "replySentAt" TIMESTAMP, "adminNote" text, "resolvedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9750d3ea1a8de9c2ba4d878c6f" ON "support_tickets" ("status", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_8679e2ff150ff0e253189ca025" ON "support_tickets" ("userId") `);
        await queryRunner.query(`CREATE TABLE "support_screenshots" ("ticketId" uuid NOT NULL, "data" bytea NOT NULL, "mimeType" character varying(20) NOT NULL, CONSTRAINT "PK_3ee50c23a79875527124c24dca3" PRIMARY KEY ("ticketId"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "support_screenshots"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8679e2ff150ff0e253189ca025"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9750d3ea1a8de9c2ba4d878c6f"`);
        await queryRunner.query(`DROP TABLE "support_tickets"`);
    }

}
