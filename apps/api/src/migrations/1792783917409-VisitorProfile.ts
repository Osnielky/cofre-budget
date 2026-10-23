import { MigrationInterface, QueryRunner } from "typeorm";

export class VisitorProfile1792783917409 implements MigrationInterface {
    name = 'VisitorProfile1792783917409'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "page_views" ADD "entry" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "country" character varying(2)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "region" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "city" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "device" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "browser" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "os" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "language" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "viewportWidth" integer`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "utmSource" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "utmMedium" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "page_views" ADD "utmCampaign" character varying(100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "utmCampaign"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "utmMedium"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "utmSource"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "viewportWidth"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "language"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "os"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "browser"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "device"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "region"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "country"`);
        await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "entry"`);
    }

}
