import { MigrationInterface, QueryRunner } from "typeorm";

export class UserLastSeen1791904532417 implements MigrationInterface {
    name = 'UserLastSeen1791904532417'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "lastSeenAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastSeenAt"`);
    }

}
