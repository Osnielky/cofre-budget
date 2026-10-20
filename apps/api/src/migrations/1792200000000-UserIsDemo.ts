import { MigrationInterface, QueryRunner } from "typeorm";

export class UserIsDemo1792200000000 implements MigrationInterface {
    name = 'UserIsDemo1792200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "isDemo" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isDemo"`);
    }

}
