import { MigrationInterface, QueryRunner } from "typeorm";

export class PageViews1792590514718 implements MigrationInterface {
    name = 'PageViews1792590514718'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "page_views" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "date" date NOT NULL, "path" character varying(200) NOT NULL, "referrerHost" character varying(100), "visitorHash" character varying(64) NOT NULL, "signedIn" boolean NOT NULL DEFAULT false, "isDemo" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3b1047277a9c2a8cfd618787671" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ee43e8daa9189f3137095ee009" ON "page_views" ("date", "visitorHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_8bd4dfdf44762acbc334575ff1" ON "page_views" ("date") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_8bd4dfdf44762acbc334575ff1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ee43e8daa9189f3137095ee009"`);
        await queryRunner.query(`DROP TABLE "page_views"`);
    }

}
