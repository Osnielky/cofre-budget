import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The schema as synchronize: true left it, generated from the entities.
 * Databases that predate migrations (production, existing dev machines) already
 * have these tables, so up() only records itself as applied there. Every later
 * schema change must be its own migration: `npm run migration:generate -- <Name>`.
 */
export class Baseline1790610365591 implements MigrationInterface {
    name = 'Baseline1790610365591'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const [{ exists }] = await queryRunner.query(`SELECT to_regclass(quote_ident(current_schema()) || '.users') IS NOT NULL AS "exists"`);
        if (exists) return;

        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying, "password" character varying, "googleId" character varying, "avatarUrl" character varying, "plan" character varying NOT NULL DEFAULT 'free', "stripeCustomerId" character varying, "netWorthGoalTargetDate" date, "netWorthGoalBaselineValue" numeric(12,2), "netWorthGoalBaselineDate" date, "emailVerified" boolean NOT NULL DEFAULT false, "plaidUserId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId"), CONSTRAINT "UQ_ab9126a074980674ba95d4cd358" UNIQUE ("stripeCustomerId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bank_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "bankName" character varying NOT NULL, "accountName" character varying NOT NULL, "accountType" character varying NOT NULL DEFAULT 'checking', "balance" numeric(12,2) NOT NULL DEFAULT '0', "currency" character varying NOT NULL DEFAULT 'USD', "color" character varying, "provider" character varying NOT NULL DEFAULT 'manual', "plaidItemId" character varying, "plaidAccountId" character varying, "last4" character varying(4), "managedByAssetId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c872de764f2038224a013ff25ed" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "plaid_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "accessToken" character varying NOT NULL, "itemId" character varying NOT NULL, "institutionId" character varying NOT NULL, "institutionName" character varying NOT NULL, "lastSync" TIMESTAMP, "cursor" text, "status" character varying NOT NULL DEFAULT 'active', "errorCode" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8807931a9622c18add4f43b8469" UNIQUE ("itemId"), CONSTRAINT "PK_71b72e4058a0cd1f773dd69c237" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, "icon" character varying NOT NULL, "color" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'expense', "isDefault" boolean NOT NULL DEFAULT false, "isFixed" boolean NOT NULL DEFAULT false, "wantNeed" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "project_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying, "projectType" character varying, "type" character varying NOT NULL DEFAULT 'expense', "name" character varying NOT NULL, "description" character varying, "icon" character varying NOT NULL DEFAULT '📦', "color" character varying NOT NULL DEFAULT '#9B6DFF', "order" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_03d7af35c2601369d030b3617bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categorization_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "matchType" character varying NOT NULL, "matchValue" character varying NOT NULL, "matchStrategy" character varying NOT NULL DEFAULT 'exact', "categoryId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7f9f800b9afbd3a96beb526b5be" UNIQUE ("userId", "matchType", "matchValue", "matchStrategy"), CONSTRAINT "PK_b1094e264581ba5142fa3f0ad47" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "bankAccountId" uuid, "externalId" character varying, "source" character varying NOT NULL DEFAULT 'plaid', "amount" numeric(12,2) NOT NULL, "name" character varying NOT NULL, "merchantName" character varying, "category" character varying, "categoryId" uuid, "recurringRuleId" character varying, "debtId" character varying, "transferAccountId" uuid, "counterpartTxId" character varying, "projectId" character varying, "projectCategoryId" uuid, "assetId" uuid, "plaidCategory" text, "date" date NOT NULL, "pending" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "parentId" uuid, "isSplitParent" boolean NOT NULL DEFAULT false, "note" character varying(500), "receiptId" uuid, "categorizedByRuleId" uuid, CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_05562bf33af5e79f1c6f42571a" ON "transactions" ("userId", "externalId") `);
        await queryRunner.query(`CREATE TABLE "recurring_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "name" character varying NOT NULL, "categoryId" uuid, "bankAccountId" uuid, "note" character varying, "interval" smallint NOT NULL DEFAULT '1', "unit" character varying NOT NULL DEFAULT 'month', "dayOfMonth" smallint, "startDate" date NOT NULL, "endDate" date, "occurrenceCount" smallint, "lastRunDate" date, "runCount" smallint NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_22942a1b99033aea3a8bc8f9e8d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_548daf9eb2fe9d9dcb9914e4a0" ON "recurring_rules" ("userId", "active") `);
        await queryRunner.query(`CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'other', "icon" character varying NOT NULL DEFAULT '📦', "color" character varying, "description" character varying, "imageUrl" text, "purchasePrice" numeric(12,2) NOT NULL DEFAULT '0', "purchaseDate" date, "status" character varying NOT NULL DEFAULT 'active', "salePrice" numeric(12,2), "saleDate" date, "purchaseTxId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "categoryId" uuid, "projectCategoryId" character varying, "month" character varying NOT NULL DEFAULT '2026-06', "sourceMonth" character varying, "amount" numeric(12,2) NOT NULL, "projectId" uuid, "notifyEnabled" boolean NOT NULL DEFAULT false, "notifyThreshold" smallint NOT NULL DEFAULT '80', "rollover" boolean NOT NULL DEFAULT false, "isRecurring" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_54cc5e7694716a878dfd007664c" UNIQUE ("userId", "categoryId", "month"), CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "debts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "borrowerName" character varying NOT NULL, "borrowerEmail" character varying, "principal" numeric(12,2) NOT NULL, "description" character varying, "startDate" date, "dueDate" date, "status" character varying NOT NULL DEFAULT 'open', "direction" character varying(10) NOT NULL DEFAULT 'lent', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4bd9f54aab9e59628a3a2657fa1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "debt_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "debtId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "date" date NOT NULL, "note" character varying, "transactionId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_53e3004f438dfaee6e6c67b5ce5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "connected_apps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "provider" character varying NOT NULL, "email" character varying, "accessToken" text, "refreshToken" text, "tokenExpiry" bigint, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1198e2f70d9af54672b48b0fdf4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "receipts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "gmailMessageId" character varying NOT NULL, "merchant" character varying NOT NULL, "orderNumber" character varying, "orderDate" date, "total" numeric(12,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'USD', "items" jsonb NOT NULL, "rawSubject" character varying, "imported" boolean NOT NULL DEFAULT false, "reviewed" boolean NOT NULL DEFAULT false, "source" character varying NOT NULL DEFAULT 'gmail', "imageData" bytea, "imageMimeType" character varying, "parsedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5e8182d7c29e023da6e1ff33bfe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_receipts_user_gmail_message" ON "receipts" ("userId", "gmailMessageId") `);
        await queryRunner.query(`CREATE TABLE "ai_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_60db12765b82858ba00c8aa4ae2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversationId" uuid NOT NULL, "role" character varying NOT NULL, "text" text NOT NULL, "widget" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a390434d4a515ba18a41bc996c2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_pending_actions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversationId" uuid NOT NULL, "messageId" uuid, "type" character varying NOT NULL, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "undoPayload" jsonb, "undoneAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "resolvedAt" TIMESTAMP, CONSTRAINT "PK_35390c713472d7414e3a7c1f583" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "stripeSubscriptionId" character varying NOT NULL, "tier" character varying NOT NULL, "interval" character varying NOT NULL, "status" character varying NOT NULL, "currentPeriodEnd" TIMESTAMP, "trialEnd" TIMESTAMP, "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fbdba4e2ac694cf8c9cecf4dc84" UNIQUE ("userId"), CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "bank_accounts" ADD CONSTRAINT "FK_45ef3ca170943e2c70e8073a7c5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "plaid_items" ADD CONSTRAINT "FK_113b361eb616d6d7a09d004ffd4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categorization_rules" ADD CONSTRAINT "FK_fa93b6f93846f9868f0518b26a4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categorization_rules" ADD CONSTRAINT "FK_0f666c6fdb18387528acd211765" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_dd5f9a2ef07b89d35aeb480f376" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_86e965e74f9cc66149cf6c90f64" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_ea8566b2cfb622d0956d4f0ae28" FOREIGN KEY ("transferAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_69d3721e92015e676085960130e" FOREIGN KEY ("projectCategoryId") REFERENCES "project_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_543e43878b0bc28d0b024fbed09" FOREIGN KEY ("categorizedByRuleId") REFERENCES "categorization_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_rules" ADD CONSTRAINT "FK_58453c7044d0b990f1a23d88be9" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_rules" ADD CONSTRAINT "FK_bd0161d70d61b86c3f2b6bf8660" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_3ece6e1292b7a86ba82145775a7" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_0441d95918d17f347cef513b9e4" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "debt_payments" ADD CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_conversations" ADD CONSTRAINT "FK_38a66d41ffe49d8d3e22b0ec208" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_messages" ADD CONSTRAINT "FK_ed5a9d697a9b12f88d6cab23169" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "FK_c044efe756565093c09d76e05ab" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_pending_actions" DROP CONSTRAINT "FK_c044efe756565093c09d76e05ab"`);
        await queryRunner.query(`ALTER TABLE "ai_messages" DROP CONSTRAINT "FK_ed5a9d697a9b12f88d6cab23169"`);
        await queryRunner.query(`ALTER TABLE "ai_conversations" DROP CONSTRAINT "FK_38a66d41ffe49d8d3e22b0ec208"`);
        await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_0441d95918d17f347cef513b9e4"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_3ece6e1292b7a86ba82145775a7"`);
        await queryRunner.query(`ALTER TABLE "recurring_rules" DROP CONSTRAINT "FK_bd0161d70d61b86c3f2b6bf8660"`);
        await queryRunner.query(`ALTER TABLE "recurring_rules" DROP CONSTRAINT "FK_58453c7044d0b990f1a23d88be9"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_543e43878b0bc28d0b024fbed09"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_69d3721e92015e676085960130e"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_ea8566b2cfb622d0956d4f0ae28"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_86e965e74f9cc66149cf6c90f64"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_dd5f9a2ef07b89d35aeb480f376"`);
        await queryRunner.query(`ALTER TABLE "categorization_rules" DROP CONSTRAINT "FK_0f666c6fdb18387528acd211765"`);
        await queryRunner.query(`ALTER TABLE "categorization_rules" DROP CONSTRAINT "FK_fa93b6f93846f9868f0518b26a4"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741"`);
        await queryRunner.query(`ALTER TABLE "plaid_items" DROP CONSTRAINT "FK_113b361eb616d6d7a09d004ffd4"`);
        await queryRunner.query(`ALTER TABLE "bank_accounts" DROP CONSTRAINT "FK_45ef3ca170943e2c70e8073a7c5"`);
        await queryRunner.query(`DROP TABLE "subscriptions"`);
        await queryRunner.query(`DROP TABLE "ai_pending_actions"`);
        await queryRunner.query(`DROP TABLE "ai_messages"`);
        await queryRunner.query(`DROP TABLE "ai_conversations"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_receipts_user_gmail_message"`);
        await queryRunner.query(`DROP TABLE "receipts"`);
        await queryRunner.query(`DROP TABLE "connected_apps"`);
        await queryRunner.query(`DROP TABLE "debt_payments"`);
        await queryRunner.query(`DROP TABLE "debts"`);
        await queryRunner.query(`DROP TABLE "budgets"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_548daf9eb2fe9d9dcb9914e4a0"`);
        await queryRunner.query(`DROP TABLE "recurring_rules"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_05562bf33af5e79f1c6f42571a"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TABLE "categorization_rules"`);
        await queryRunner.query(`DROP TABLE "project_categories"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "plaid_items"`);
        await queryRunner.query(`DROP TABLE "bank_accounts"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
