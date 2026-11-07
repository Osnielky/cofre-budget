import { MigrationInterface, QueryRunner } from "typeorm";

export class PerformanceIndexes1794085672792 implements MigrationInterface {
    name = 'PerformanceIndexes1794085672792'

    /* Indexes for the hot lookups: owner + date and account + date on transactions
       (the list, budgets, net worth, CSV import), the FK columns whose SET NULL
       and lookups scanned the table, and the owner columns on the small tables. */
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_0822bb95cb002f012690b63a73" ON "bank_accounts" ("plaidAccountId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_45ef3ca170943e2c70e8073a7c" ON "bank_accounts" ("userId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_113b361eb616d6d7a09d004ffd" ON "plaid_items" ("userId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_13e8b2a21988bec6fdcbb1fa74" ON "categories" ("userId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_e54745cc015d1e069252c00b84" ON "transactions" ("parentId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_8a45cd832ede8ad4dc4769dbb3" ON "transactions" ("recurringRuleId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_92d1d5070de965ff398a522b4f" ON "transactions" ("projectId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_86e965e74f9cc66149cf6c90f6" ON "transactions" ("categoryId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_9e30c3717df048bec464da48c6" ON "transactions" ("bankAccountId", "date") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_31c0fafe7c59f688d0e7e7e322" ON "transactions" ("userId", "date") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_361a53ae58ef7034adc3c06f09" ON "projects" ("userId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_834960a509c776eb841644a9ba" ON "debts" ("userId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_d2a2d5006c00bb3998be54ec54" ON "debt_payments" ("debtId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_38a66d41ffe49d8d3e22b0ec20" ON "ai_conversations" ("userId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ed5a9d697a9b12f88d6cab2316" ON "ai_messages" ("conversationId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ed5a9d697a9b12f88d6cab2316"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_38a66d41ffe49d8d3e22b0ec20"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_d2a2d5006c00bb3998be54ec54"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_834960a509c776eb841644a9ba"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_361a53ae58ef7034adc3c06f09"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_31c0fafe7c59f688d0e7e7e322"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_9e30c3717df048bec464da48c6"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_86e965e74f9cc66149cf6c90f6"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_92d1d5070de965ff398a522b4f"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_8a45cd832ede8ad4dc4769dbb3"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_e54745cc015d1e069252c00b84"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_13e8b2a21988bec6fdcbb1fa74"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_113b361eb616d6d7a09d004ffd"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_45ef3ca170943e2c70e8073a7c"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_0822bb95cb002f012690b63a73"`);
    }

}
