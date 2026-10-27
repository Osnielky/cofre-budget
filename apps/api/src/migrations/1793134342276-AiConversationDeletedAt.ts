import { MigrationInterface, QueryRunner } from "typeorm";

export class AiConversationDeletedAt1793134342276 implements MigrationInterface {
    name = 'AiConversationDeletedAt1793134342276'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_conversations" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_conversations" DROP COLUMN "deletedAt"`);
    }

}
