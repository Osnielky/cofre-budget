import { MigrationInterface, QueryRunner } from "typeorm";

/** Data-only: the seeded Investments category becomes a 'savings' category, so
 *  money moved into investments stops counting as spending. Only untouched
 *  defaults are switched — a user who already retyped theirs keeps their choice. */
export class InvestmentsAsSavings1791301606403 implements MigrationInterface {
    name = 'InvestmentsAsSavings1791301606403'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "categories" SET "type" = 'savings', "description" = 'Money you invest or save — brokerage, retirement & savings contributions' WHERE "isDefault" = true AND "name" = 'Investments' AND "type" = 'income'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "categories" SET "type" = 'income', "description" = 'Dividends, returns & capital gains' WHERE "isDefault" = true AND "name" = 'Investments' AND "type" = 'savings'`);
    }

}
