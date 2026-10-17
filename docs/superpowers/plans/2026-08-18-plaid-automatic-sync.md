# Plaid Automatic Sync & Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cofre's existing Plaid integration sync transactions automatically (webhook-driven, no manual click) and work with real banks in production, including institutions that require Plaid's OAuth redirect flow and connections that need re-authentication.

**Architecture:** Migrate the sync engine from date-range polling (`transactionsGet`) to Plaid's cursor-based `/transactions/sync`; add a public, signature-verified webhook endpoint that triggers sync the instant Plaid has new data; add an OAuth redirect page and a reconnect flow so Link can complete for OAuth banks and recover from expired bank logins.

**Tech Stack:** NestJS 11 + TypeORM (Postgres, `synchronize: true`), `plaid` SDK v42, `jsonwebtoken` (webhook signature verification), `react-plaid-link` v4 (already installed), Vitest (`apps/api`, pure-logic tests only — this repo has no DB-backed test harness).

**Spec:** `docs/superpowers/specs/2026-08-18-plaid-automatic-sync-design.md`

## Global Constraints

- Webhook-driven sync only — no cron/polling job (user's explicit choice, favors lower Plaid API usage).
- Don't touch the existing `@RequiresPlan('pro')` gate on `PlaidController` — out of scope.
- Preserve existing dedup (`externalId` + `userId` composite unique index) and categorization-rule-matching behavior (`CategorizationRulesService.getActiveRules` / `matchRule`) exactly as today.
- Schema changes rely on TypeORM `synchronize: true` — no migration files, new columns just need the API restarted.
- `.env` is not committed — tasks that need new env vars document the names/values; nobody edits the real `.env` file as a plan step.
- Frontend styling must only use the CSS variables in `globals.css` (`--color-*`, `--glass-*`) — never hardcode colors — per project convention.
- Web path alias `@/*` → `apps/web/src/*`.
- This repo's only test runner is Vitest for pure-logic modules (`apps/api/src/**/*.test.ts`, run via `npx vitest run --root apps/api`). Service/controller/DB-backed code has no automated tests anywhere in this codebase — verify those manually as each task describes, matching existing project practice.

---

## Task 1: `PlaidItem` entity — cursor & status columns

**Files:**
- Modify: `apps/api/src/plaid/plaid-item.entity.ts`

**Interfaces:**
- Produces: `PlaidItem.cursor: string | null`, `PlaidItem.status: string` (`'active' | 'error'`, default `'active'`), `PlaidItem.errorCode: string | null` — consumed by Tasks 4, 5, 6, 7, 8.

- [ ] **Step 1: Add the three columns**

In `apps/api/src/plaid/plaid-item.entity.ts`, add after the existing `lastSync` column:

```ts
  /* Plaid's /transactions/sync pagination cursor. Null until the first sync completes. */
  @Column({ type: 'text', nullable: true })
  cursor: string | null;

  /* 'active' | 'error' — set to 'error' by the webhook handler when Plaid reports the
     item needs attention (e.g. ITEM_LOGIN_REQUIRED); cleared back to 'active' by the
     next successful sync. */
  @Column({ default: 'active' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  errorCode: string | null;
```

- [ ] **Step 2: Verify the schema updates**

Run: `npm run dev:api` (or `npx nx serve api`), let it boot fully, then stop it.
Expected: no TypeORM errors in the log; `psql` against `cofre_budget` shows the new columns:

```bash
psql "$DATABASE_URL" -c "\d plaid_items" | grep -E "cursor|status|errorCode"
```

Expected output includes `cursor`, `status`, `errorcode` (Postgres lowercases unquoted identifiers) rows.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plaid/plaid-item.entity.ts
git commit -m "feat(plaid): add cursor and status columns to PlaidItem"
```

---

## Task 2: Capture the raw request body for webhook signature verification

**Files:**
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Produces: every request now carries `req.rawBody: Buffer` (the exact bytes received, before JSON parsing) — consumed by Task 3's webhook controller.

- [ ] **Step 1: Add a `verify` callback to the JSON body parser**

In `apps/api/src/main.ts`, replace:

```ts
  app.use(express.json({ limit: '5mb' }));
```

with:

```ts
  app.use(
    express.json({
      limit: '5mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
```

- [ ] **Step 2: Verify the API still boots and existing routes still work**

Run: `npm run dev:api`, then in another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/api/health
```

Expected: `200` (or whatever the health endpoint already returns — confirm it's unchanged from before this edit, not a new failure).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): capture raw request body for webhook signature verification"
```

---

## Task 3: Plaid webhook signature verification (TDD)

**Files:**
- Create: `apps/api/src/plaid/plaid-webhook-signature.ts`
- Create: `apps/api/src/plaid/plaid-webhook-signature.test.ts`
- Create: `apps/api/src/plaid/plaid-webhook-verifier.service.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `verifyPlaidWebhookSignature(token: string, rawBody: Buffer, fetchKey: (kid: string) => Promise<PlaidJWK>): Promise<boolean>` (pure, exported from `plaid-webhook-signature.ts`)
  - `interface PlaidJWK { kty: string; crv: string; x: string; y: string; expired_at: number | null }` (exported from the same file)
  - `PlaidWebhookVerifierService` (Injectable, exported from `plaid-webhook-verifier.service.ts`) with `async verify(token: string, rawBody: Buffer): Promise<boolean>` — consumed by Task 6's webhook controller.

- [ ] **Step 1: Install `jsonwebtoken`**

```bash
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/plaid/plaid-webhook-signature.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { verifyPlaidWebhookSignature, PlaidJWK } from './plaid-webhook-signature';

function makeSignedWebhook(bodyObj: object, overrides: { iat?: number } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = 'test-key-1';
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const iat = overrides.iat ?? Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { request_body_sha256: bodyHash, iat },
    privateKey,
    { algorithm: 'ES256', header: { kid, alg: 'ES256' }, noTimestamp: true },
  );
  const jwkPublic = publicKey.export({ format: 'jwk' }) as { x: string; y: string; crv: string; kty: string };
  const jwk: PlaidJWK = { kty: jwkPublic.kty, crv: jwkPublic.crv, x: jwkPublic.x, y: jwkPublic.y, expired_at: null };
  return { token, rawBody, jwk };
}

describe('verifyPlaidWebhookSignature', () => {
  it('accepts a correctly signed webhook with a matching body hash', async () => {
    const { token, rawBody, jwk } = makeSignedWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' });
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => jwk);
    expect(result).toBe(true);
  });

  it('rejects when the raw body does not match the signed hash', async () => {
    const { token, jwk } = makeSignedWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' });
    const tamperedBody = Buffer.from(JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'HISTORICAL_UPDATE' }));
    const result = await verifyPlaidWebhookSignature(token, tamperedBody, async () => jwk);
    expect(result).toBe(false);
  });

  it('rejects a token signed by a different key than the one Plaid returns', async () => {
    const { token, rawBody } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    const { jwk: otherJwk } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => otherJwk);
    expect(result).toBe(false);
  });

  it('rejects a token older than 5 minutes', async () => {
    const staleIat = Math.floor(Date.now() / 1000) - 400;
    const { token, rawBody, jwk } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' }, { iat: staleIat });
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => jwk);
    expect(result).toBe(false);
  });

  it('rejects when the fetched key is expired', async () => {
    const { token, rawBody, jwk } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    const expiredJwk: PlaidJWK = { ...jwk, expired_at: Math.floor(Date.now() / 1000) - 10 };
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => expiredJwk);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --root apps/api src/plaid/plaid-webhook-signature.test.ts`
Expected: FAIL — `plaid-webhook-signature.ts` doesn't exist yet (module not found).

- [ ] **Step 4: Implement `verifyPlaidWebhookSignature`**

Create `apps/api/src/plaid/plaid-webhook-signature.ts`:

```ts
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface PlaidJWK {
  kty: string;
  crv: string;
  x: string;
  y: string;
  expired_at: number | null;
}

const MAX_CLOCK_SKEW_SECONDS = 300;

/* Verifies a Plaid webhook JWT per https://plaid.com/docs/api/webhooks/webhook-verification/ —
   decodes the JWT header for `kid`, fetches the matching public key via `fetchKey`, verifies
   the ES256 signature, rejects stale tokens, and confirms the body-hash claim matches the raw
   request bytes actually received. `fetchKey` is injected so this stays testable without a
   live Plaid API call. */
export async function verifyPlaidWebhookSignature(
  token: string,
  rawBody: Buffer,
  fetchKey: (kid: string) => Promise<PlaidJWK>,
): Promise<boolean> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') return false;
  const kid = (decoded.header as { kid?: string }).kid;
  if (!kid) return false;

  let jwk: PlaidJWK;
  try {
    jwk = await fetchKey(kid);
  } catch {
    return false;
  }
  if (jwk.expired_at) return false;

  const key = crypto.createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: 'jwk',
  });

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, key, { algorithms: ['ES256'] }) as jwt.JwtPayload;
  } catch {
    return false;
  }

  const iat = payload.iat ?? 0;
  if (Math.abs(Date.now() / 1000 - iat) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expectedHash = payload['request_body_sha256'];
  if (typeof expectedHash !== 'string') return false;
  const actualHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --root apps/api src/plaid/plaid-webhook-signature.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Create the injectable NestJS wrapper**

Create `apps/api/src/plaid/plaid-webhook-verifier.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { verifyPlaidWebhookSignature, PlaidJWK } from './plaid-webhook-signature';

@Injectable()
export class PlaidWebhookVerifierService {
  private readonly client: PlaidApi;
  private keyCache = new Map<string, PlaidJWK>();

  constructor(private config: ConfigService) {
    const env = this.config.get<string>('PLAID_ENV', 'sandbox');
    const cfg = new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.config.get<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.config.get<string>('PLAID_SECRET'),
        },
      },
    });
    this.client = new PlaidApi(cfg);
  }

  async verify(token: string, rawBody: Buffer): Promise<boolean> {
    return verifyPlaidWebhookSignature(token, rawBody, (kid) => this.fetchKey(kid));
  }

  private async fetchKey(kid: string): Promise<PlaidJWK> {
    const cached = this.keyCache.get(kid);
    if (cached) return cached;
    const res = await this.client.webhookVerificationKeyGet({ key_id: kid });
    const jwk: PlaidJWK = {
      kty: res.data.key.kty,
      crv: res.data.key.crv,
      x: res.data.key.x,
      y: res.data.key.y,
      expired_at: res.data.key.expired_at,
    };
    this.keyCache.set(kid, jwk);
    return jwk;
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json apps/api/src/plaid/plaid-webhook-signature.ts apps/api/src/plaid/plaid-webhook-signature.test.ts apps/api/src/plaid/plaid-webhook-verifier.service.ts
git commit -m "feat(plaid): add Plaid webhook signature verification"
```

---

## Task 4: Migrate the sync engine to cursor-based `/transactions/sync`

**Files:**
- Modify: `apps/api/src/plaid/plaid.service.ts`

**Interfaces:**
- Consumes: `PlaidItem.cursor/status/errorCode` (Task 1).
- Produces: `PlaidService.runSync(item: PlaidItem, accessToken: string): Promise<void>` (private) — consumed internally by `exchangeToken`, `syncItem`, and Tasks 5 & 7's new methods.

- [ ] **Step 1: Replace `syncTransactions` with cursor-based `runSync`**

In `apps/api/src/plaid/plaid.service.ts`, replace the entire `private async syncTransactions(item: PlaidItem, accessToken: string): Promise<void> { ... }` method with:

```ts
  /* Cursor-based sync via /transactions/sync — pages through everything new since
     item.cursor, applying added/modified/removed. On any failure the whole sync is
     abandoned without persisting a new cursor, which is safe: the next attempt just
     re-processes the same page, and every operation here (upsert-by-externalId,
     delete-by-externalId) is idempotent. */
  private async runSync(item: PlaidItem, accessToken: string): Promise<void> {
    try {
      let cursor = item.cursor ?? undefined;
      let hasMore = true;
      const rules = await this.rulesService.getActiveRules(item.userId);

      while (hasMore) {
        const res = await this.client.transactionsSync({ access_token: accessToken, cursor });

        for (const pt of [...res.data.added, ...res.data.modified]) {
          const account = await this.accountRepo.findOneBy({ plaidAccountId: pt.account_id });
          if (!account) continue;

          const existing = await this.txRepo.findOneBy({ externalId: pt.transaction_id, userId: item.userId });
          if (existing) {
            existing.pending = pt.pending;
            existing.amount = -(pt.amount);
            existing.name = pt.name;
            existing.merchantName = pt.merchant_name ?? undefined;
            existing.plaidCategory = pt.category ?? [];
            existing.date = pt.date;
            await this.txRepo.save(existing);
            continue;
          }

          const matchedRule = this.rulesService.matchRule(rules, { merchantName: pt.merchant_name, name: pt.name });
          await this.txRepo.save(
            this.txRepo.create({
              userId: item.userId,
              bankAccountId: account.id,
              externalId: pt.transaction_id,
              /* Plaid: positive = debit; we flip so positive = money in */
              amount: -(pt.amount),
              name: pt.name,
              merchantName: pt.merchant_name ?? undefined,
              plaidCategory: pt.category ?? [],
              date: pt.date,
              pending: pt.pending,
              categoryId: matchedRule?.categoryId ?? undefined,
              categorizedByRuleId: matchedRule?.id ?? undefined,
            }),
          );
        }

        for (const rt of res.data.removed) {
          await this.txRepo.delete({ externalId: rt.transaction_id, userId: item.userId });
        }

        cursor = res.data.next_cursor;
        hasMore = res.data.has_more;
      }

      item.cursor = cursor ?? null;
      item.lastSync = new Date();
      item.status = 'active';
      item.errorCode = null;
      await this.itemRepo.save(item);
    } catch (err) {
      this.logger.error('Transaction sync failed', err);
    }
  }
```

- [ ] **Step 2: Update the two existing call sites**

In `exchangeToken()`, replace:

```ts
    /* Kick off an initial transaction sync */
    await this.syncTransactions(item, access_token);
```

with:

```ts
    /* Kick off an initial transaction sync */
    await this.runSync(item, access_token);
```

In `syncItem()`, replace:

```ts
    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.syncTransactions(item, accessToken);
```

with:

```ts
    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.runSync(item, accessToken);
```

- [ ] **Step 3: Add `webhook` and `redirect_uri` to `createLinkToken`**

Replace the body of `createLinkToken`:

```ts
  async createLinkToken(userId: string): Promise<string> {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Cofre Budget',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return res.data.link_token;
  }
```

with:

```ts
  async createLinkToken(userId: string): Promise<string> {
    const webhook = this.config.get<string>('PLAID_WEBHOOK_URL');
    const redirectUri = this.config.get<string>('PLAID_OAUTH_REDIRECT_URI');
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Cofre Budget',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(webhook ? { webhook } : {}),
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });
    return res.data.link_token;
  }
```

(Both env vars are optional here — local sandbox dev without them keeps working exactly as today.)

- [ ] **Step 4: Verify manually against Plaid sandbox**

Run: `npm run dev:api` and `npm run dev:web`, log in, go to Settings → Bank Accounts, click "Connect Bank", complete the sandbox flow (any test institution, e.g. "Platypus Bank", credentials `user_good` / `pass_good`).
Expected: accounts appear, and transactions show up in the Transactions page — same outcome as before this migration, just via the new sync path. Check the API logs for no "Transaction sync failed" errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plaid/plaid.service.ts
git commit -m "feat(plaid): migrate transaction sync to cursor-based /transactions/sync"
```

---

## Task 5: Webhook-facing sync & status methods on `PlaidService`

**Files:**
- Modify: `apps/api/src/plaid/plaid.service.ts`

**Interfaces:**
- Consumes: `runSync` (Task 4).
- Produces: `PlaidService.syncByExternalItemId(externalItemId: string): Promise<void>`, `PlaidService.markItemStatus(externalItemId: string, status: string, errorCode: string | null): Promise<void>` — consumed by Task 6's webhook controller.

- [ ] **Step 1: Add the two methods**

In `apps/api/src/plaid/plaid.service.ts`, add after `syncItem`:

```ts
  /* Looked up by Plaid's item_id (not our PlaidItem.id) — this is what webhook
     payloads carry, with no authenticated user in the request. */
  async syncByExternalItemId(externalItemId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.itemId = :externalItemId', { externalItemId })
      .getOne();
    if (!item) return;
    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.runSync(item, accessToken);
  }

  async markItemStatus(externalItemId: string, status: string, errorCode: string | null): Promise<void> {
    const item = await this.itemRepo.findOneBy({ itemId: externalItemId });
    if (!item) return;
    item.status = status;
    item.errorCode = errorCode;
    await this.itemRepo.save(item);
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plaid/plaid.service.ts
git commit -m "feat(plaid): add webhook-facing sync and item-status methods"
```

---

## Task 6: Webhook endpoint

**Files:**
- Create: `apps/api/src/plaid/plaid-webhook.controller.ts`
- Modify: `apps/api/src/plaid/plaid.module.ts`

**Interfaces:**
- Consumes: `PlaidWebhookVerifierService.verify` (Task 3), `PlaidService.syncByExternalItemId` / `markItemStatus` (Task 5), `req.rawBody` (Task 2).
- Produces: `POST /api/plaid/webhook` (public, no auth guards).

- [ ] **Step 1: Create the webhook controller**

Create `apps/api/src/plaid/plaid-webhook.controller.ts`:

```ts
import { Controller, Post, Req, HttpCode, UnauthorizedException } from '@nestjs/common';
import { PlaidService } from './plaid.service';
import { PlaidWebhookVerifierService } from './plaid-webhook-verifier.service';

/* Plaid calls this server-to-server with no user session, so it deliberately carries
   none of PlaidController's JwtAuthGuard/PlanGuard — request authenticity instead
   comes from the Plaid-Verification JWT checked below. */
@Controller('plaid')
export class PlaidWebhookController {
  constructor(
    private service: PlaidService,
    private verifier: PlaidWebhookVerifierService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: any) {
    const signature = req.headers['plaid-verification'];
    const rawBody: Buffer | undefined = req.rawBody;
    if (typeof signature !== 'string' || !rawBody) {
      throw new UnauthorizedException('Missing webhook verification');
    }

    const verified = await this.verifier.verify(signature, rawBody);
    if (!verified) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body ?? {};
    const webhookType = body.webhook_type;
    const webhookCode = body.webhook_code;
    const itemId = body.item_id;

    if (webhookType === 'TRANSACTIONS' && webhookCode === 'SYNC_UPDATES_AVAILABLE') {
      await this.service.syncByExternalItemId(itemId);
    } else if (webhookType === 'ITEM' && webhookCode === 'ERROR') {
      await this.service.markItemStatus(itemId, 'error', body.error?.error_code ?? null);
    } else if (webhookType === 'ITEM' && (webhookCode === 'PENDING_EXPIRATION' || webhookCode === 'PENDING_DISCONNECT')) {
      await this.service.markItemStatus(itemId, 'error', webhookCode);
    }

    return { acknowledged: true };
  }
}
```

- [ ] **Step 2: Register the controller and verifier provider**

In `apps/api/src/plaid/plaid.module.ts`, update:

```ts
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';
```

to also import the new pieces:

```ts
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';
import { PlaidWebhookController } from './plaid-webhook.controller';
import { PlaidWebhookVerifierService } from './plaid-webhook-verifier.service';
```

and update the `@Module` decorator:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([PlaidItem, BankAccount, Transaction]), CategorizationRulesModule],
  providers: [PlaidService, PlaidWebhookVerifierService],
  controllers: [PlaidController, PlaidWebhookController],
  exports: [PlaidService],
})
export class PlaidModule {}
```

- [ ] **Step 3: Verify signature enforcement manually**

Run: `npm run dev:api`, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3333/api/plaid/webhook \
  -H "Content-Type: application/json" -d '{"webhook_type":"ITEM","webhook_code":"ERROR"}'
```

Expected: `401` (no `Plaid-Verification` header).

- [ ] **Step 4: Verify a real sandbox webhook is accepted**

With an item already connected via sandbox (from Task 4's manual test), use Plaid's sandbox webhook-firing endpoint to trigger a real, correctly-signed webhook against your running API (needs a public URL — use `ngrok http 3333` and set `PLAID_WEBHOOK_URL=https://<ngrok-domain>/api/plaid/webhook` in your local `.env`, then restart the API so the next `Connect Bank` picks it up, or call Plaid's `/sandbox/item/fire_webhook` directly against your ngrok URL). Confirm in the API logs that the webhook is accepted (`acknowledged: true`) and `syncByExternalItemId` runs without error. This step requires manual setup with ngrok or an equivalent tunnel — there's no way to receive an inbound webhook on `localhost` otherwise.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plaid/plaid-webhook.controller.ts apps/api/src/plaid/plaid.module.ts
git commit -m "feat(plaid): add webhook endpoint for automatic transaction sync"
```

---

## Task 7: Reconnect flow (backend)

**Files:**
- Modify: `apps/api/src/plaid/plaid.service.ts`
- Modify: `apps/api/src/plaid/plaid.controller.ts`

**Interfaces:**
- Consumes: `runSync` (Task 4), `PlaidItem.status/errorCode` (Task 1).
- Produces: `PlaidService.createReconnectLinkToken(userId: string, plaidItemId: string): Promise<string>`, `PlaidService.completeReconnect(plaidItemId: string, userId: string): Promise<void>`; `POST /plaid/reconnect-token/:itemId` → `{ link_token: string }`, `POST /plaid/reconnect/:itemId/complete` → `{ status: 'active' }` — consumed by Task 9 (frontend).

- [ ] **Step 1: Add the two service methods**

In `apps/api/src/plaid/plaid.service.ts`, add `NotFoundException` to the imports:

```ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
```

Then add after `findItemsByUser`:

```ts
  /* Update-mode link token: reuses the existing Item's access token so the user
     re-authenticates the same connection instead of creating a new one. */
  async createReconnectLinkToken(userId: string, plaidItemId: string): Promise<string> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');

    const accessToken = decryptToken(item.accessToken, this.encKey);
    const webhook = this.config.get<string>('PLAID_WEBHOOK_URL');
    const redirectUri = this.config.get<string>('PLAID_OAUTH_REDIRECT_URI');
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Cofre Budget',
      access_token: accessToken,
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(webhook ? { webhook } : {}),
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });
    return res.data.link_token;
  }

  /* Called after update-mode Link succeeds. A successful sync clears status/errorCode
     back to 'active' on its own (see runSync), so there's no separate "clear error"
     step — this just runs the sync that proves the reconnect worked. */
  async completeReconnect(plaidItemId: string, userId: string): Promise<void> {
    const item = await this.itemRepo
      .createQueryBuilder('item')
      .addSelect('item.accessToken')
      .where('item.id = :plaidItemId AND item.userId = :userId', { plaidItemId, userId })
      .getOne();
    if (!item) throw new NotFoundException('Bank connection not found');

    const accessToken = decryptToken(item.accessToken, this.encKey);
    await this.runSync(item, accessToken);
  }
```

- [ ] **Step 2: Add the two controller endpoints**

In `apps/api/src/plaid/plaid.controller.ts`, add after the `sync` method:

```ts
  @Post('reconnect-token/:itemId')
  async createReconnectLinkToken(@Param('itemId') itemId: string, @Request() req: any) {
    const linkToken = await this.service.createReconnectLinkToken(req.user.id, itemId);
    return { link_token: linkToken };
  }

  @Post('reconnect/:itemId/complete')
  async completeReconnect(@Param('itemId') itemId: string, @Request() req: any) {
    await this.service.completeReconnect(itemId, req.user.id);
    return { status: 'active' };
  }
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev:api`. With a sandbox item already connected (from Task 4), simulate a login-required error via Plaid's sandbox reset-login tool, then check the item is marked `status = 'error'`:

```bash
psql "$DATABASE_URL" -c "select id, status, \"errorCode\" from plaid_items;"
```

(You can also set it manually for this check: `psql "$DATABASE_URL" -c "update plaid_items set status='error', \"errorCode\"='ITEM_LOGIN_REQUIRED';"`.)

Then, while logged in as that user, call:

```bash
curl -s -X POST http://localhost:3333/api/plaid/reconnect-token/<plaidItemId> \
  -H "Cookie: access_token=<your JWT cookie>"
```

Expected: `{"link_token": "link-sandbox-..."}`. Complete Link in update mode via the frontend once Task 9 is done, or confirm the token is well-formed for now.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/plaid/plaid.service.ts apps/api/src/plaid/plaid.controller.ts
git commit -m "feat(plaid): add reconnect endpoints for items needing re-authentication"
```

---

## Task 8: Surface item status on the bank accounts list

**Files:**
- Modify: `apps/api/src/bank-accounts/bank-accounts.module.ts`
- Modify: `apps/api/src/bank-accounts/bank-accounts.service.ts`

**Interfaces:**
- Consumes: `PlaidItem.status` (Task 1).
- Produces: `BankAccountsService.findAllByUser` return type gains `plaidStatus: string | null` per account — consumed by Task 9 (frontend).

- [ ] **Step 1: Register `PlaidItem` in the module**

In `apps/api/src/bank-accounts/bank-accounts.module.ts`, add `PlaidItem` to the `TypeOrmModule.forFeature([...])` array (import it from `'../plaid/plaid-item.entity'`).

- [ ] **Step 2: Join item status into `findAllByUser`**

In `apps/api/src/bank-accounts/bank-accounts.service.ts`, add the import and constructor param:

```ts
import { PlaidItem } from '../plaid/plaid-item.entity';
```

```ts
  constructor(
    @InjectRepository(BankAccount)
    private repo: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private txRepo: Repository<Transaction>,
    @InjectRepository(PlaidItem)
    private plaidItemRepo: Repository<PlaidItem>,
  ) {}
```

Replace `findAllByUser`:

```ts
  async findAllByUser(userId: string): Promise<(BankAccount & { txCount: number; plaidStatus: string | null })[]> {
    const accounts = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    const counts = await this.txRepo
      .createQueryBuilder('t')
      .select('t.bankAccountId', 'id')
      .addSelect('COUNT(*)', 'c')
      .where('t.userId = :userId', { userId })
      .andWhere('t.bankAccountId IS NOT NULL')
      .groupBy('t.bankAccountId')
      .getRawMany<{ id: string; c: string }>();
    const byId = new Map(counts.map((r) => [r.id, Number(r.c)]));

    const plaidItems = await this.plaidItemRepo.find({ where: { userId } });
    const statusByPlaidItemId = new Map(plaidItems.map((p) => [p.id, p.status]));

    return accounts.map((a) => ({
      ...a,
      txCount: byId.get(a.id) ?? 0,
      plaidStatus: a.plaidItemId ? statusByPlaidItemId.get(a.plaidItemId) ?? null : null,
    }));
  }
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev:api`, then (logged in as a user with a connected sandbox account):

```bash
curl -s http://localhost:3333/api/bank-accounts -H "Cookie: access_token=<your JWT cookie>" | python3 -m json.tool
```

Expected: each Plaid-connected account object includes `"plaidStatus": "active"` (or `"error"` if you set that during Task 7's manual test).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bank-accounts/bank-accounts.module.ts apps/api/src/bank-accounts/bank-accounts.service.ts
git commit -m "feat(bank-accounts): surface Plaid item status on the accounts list"
```

---

## Task 9: Reconnect flow (frontend) + OAuth continuation state

**Files:**
- Modify: `apps/web/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `BankAccount.plaidStatus` (Task 8), `POST /plaid/reconnect-token/:itemId` / `POST /plaid/reconnect/:itemId/complete` (Task 7).
- Produces: `sessionStorage` keys `plaidLinkToken`, `plaidLinkMode`, `plaidReconnectItemId` — consumed by Task 10's OAuth redirect page.

- [ ] **Step 1: Extend the `BankAccount` interface**

In `apps/web/src/app/settings/page.tsx`, add to the `BankAccount` interface:

```ts
  plaidStatus?: string | null;
```

- [ ] **Step 2: Add reconnect state and persist link tokens to `sessionStorage`**

Near the existing `linkToken`/`connecting` state declarations, add:

```ts
  const [linkMode, setLinkMode] = useState<'connect' | 'reconnect'>('connect');
  const [reconnectItemId, setReconnectItemId] = useState<string | null>(null);
```

Replace `openPlaidLink`:

```ts
  const openPlaidLink = async () => {
    setConnecting(true);
    setLinkMode('connect');
    try {
      const res = await fetch(`${API}/plaid/link-token`, { method: 'POST', credentials: 'include' });
      const { link_token } = await res.json();
      sessionStorage.setItem('plaidLinkToken', link_token);
      sessionStorage.setItem('plaidLinkMode', 'connect');
      setLinkToken(link_token);
    } catch {
      setError('Could not open bank connection. Check your Plaid credentials.');
      setConnecting(false);
    }
  };

  const openReconnect = async (account: BankAccount) => {
    if (!account.plaidItemId) return;
    setConnecting(true);
    setLinkMode('reconnect');
    setReconnectItemId(account.plaidItemId);
    try {
      const res = await fetch(`${API}/plaid/reconnect-token/${account.plaidItemId}`, { method: 'POST', credentials: 'include' });
      const { link_token } = await res.json();
      sessionStorage.setItem('plaidLinkToken', link_token);
      sessionStorage.setItem('plaidLinkMode', 'reconnect');
      sessionStorage.setItem('plaidReconnectItemId', account.plaidItemId);
      setLinkToken(link_token);
    } catch {
      setError('Could not open bank reconnection.');
      setConnecting(false);
    }
  };
```

- [ ] **Step 3: Branch `onPlaidSuccess` on `linkMode`**

Replace `onPlaidSuccess`:

```ts
  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    setConnecting(true);
    try {
      if (linkMode === 'reconnect' && reconnectItemId) {
        await fetch(`${API}/plaid/reconnect/${reconnectItemId}/complete`, { method: 'POST', credentials: 'include' });
        const res = await fetch(`${API}/bank-accounts`, { credentials: 'include' });
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
      } else {
        const res = await fetch(`${API}/plaid/exchange`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id ?? '',
            institution_name: metadata.institution?.name ?? 'Unknown Bank',
          }),
        });
        if (!res.ok) throw new Error();
        const newAccounts: BankAccount[] = await res.json();
        setAccounts((prev) => {
          const ids = new Set(newAccounts.map((a) => a.id));
          return [...prev.filter((a) => !ids.has(a.id)), ...newAccounts];
        });
      }
    } catch {
      setError(linkMode === 'reconnect' ? 'Reconnected, but refresh failed. Try syncing manually.' : 'Bank connected but account import failed. Try syncing manually.');
    } finally {
      setLinkToken(null); setConnecting(false); setReconnectItemId(null);
      sessionStorage.removeItem('plaidLinkToken');
      sessionStorage.removeItem('plaidLinkMode');
      sessionStorage.removeItem('plaidReconnectItemId');
    }
  }, [linkMode, reconnectItemId]);
```

- [ ] **Step 4: Show a "Needs reconnect" badge and Reconnect button**

Replace the `isConnected ? (...) : (...)` badge block (the one rendering "Synced" / "Manual"):

```tsx
                            {isConnected ? (
                              account.plaidStatus === 'error' ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                  style={{ background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)', color: 'var(--color-rose)' }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-rose)' }} />
                                  Needs reconnect
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                  style={{ background: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)' }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-green)' }} />
                                  Synced
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                style={{ background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)', color: 'var(--color-text-muted)' }}>
                                Manual
                              </span>
                            )}
```

Replace the `{isConnected && (...)}` Sync button block:

```tsx
                          {isConnected && (
                            account.plaidStatus === 'error' ? (
                              <button onClick={() => openReconnect(account)} disabled={connecting}
                                className="px-2.5 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold transition-colors disabled:opacity-40"
                                style={{ color: 'var(--color-rose)' }}
                                title="Reconnect bank">
                                Reconnect
                              </button>
                            ) : (
                              <button onClick={() => handleSync(account)} disabled={syncingId === account.id}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                                style={{ color: syncingId === account.id ? 'var(--color-text-muted)' : 'var(--color-green)' }}
                                title="Sync now">
                                <SyncIcon spinning={syncingId === account.id} />
                              </button>
                            )
                          )}
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev:web` and `npm run dev:api`. Log in, go to Settings → Bank Accounts.
Expected: existing "Connect Bank" flow still works unchanged. Manually flip one account's item to `status='error'` in the DB (as in Task 7 Step 3), reload — expect a rose "Needs reconnect" badge and a "Reconnect" button in place of the sync icon; clicking it opens Plaid Link in update mode.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/settings/page.tsx
git commit -m "feat(web): add bank reconnect flow to Settings"
```

---

## Task 10: OAuth redirect page

**Files:**
- Create: `apps/web/src/app/settings/plaid-oauth-redirect/page.tsx`

**Interfaces:**
- Consumes: `sessionStorage` keys `plaidLinkToken`/`plaidLinkMode`/`plaidReconnectItemId` (Task 9), `POST /plaid/exchange`, `POST /plaid/reconnect/:itemId/complete` (Task 7).

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/settings/plaid-oauth-redirect/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/* Landing page for Plaid Link's OAuth round trip (required by banks like Chase,
   BofA, Wells Fargo). The Link token and connect-vs-reconnect intent were stashed
   in sessionStorage before the browser navigated to the bank's OAuth page, since
   React state doesn't survive that navigation. */
export default function PlaidOAuthRedirectPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const token = sessionStorage.getItem('plaidLinkToken');
    if (!token) {
      setStatus('error');
      return;
    }
    setLinkToken(token);
  }, []);

  const onSuccess = async (publicToken: string, metadata: any) => {
    const mode = sessionStorage.getItem('plaidLinkMode');
    try {
      if (mode === 'reconnect') {
        const itemId = sessionStorage.getItem('plaidReconnectItemId');
        if (itemId) {
          await fetch(`${API}/plaid/reconnect/${itemId}/complete`, { method: 'POST', credentials: 'include' });
        }
      } else {
        await fetch(`${API}/plaid/exchange`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id ?? '',
            institution_name: metadata.institution?.name ?? 'Unknown Bank',
          }),
        });
      }
    } finally {
      sessionStorage.removeItem('plaidLinkToken');
      sessionStorage.removeItem('plaidLinkMode');
      sessionStorage.removeItem('plaidReconnectItemId');
      router.replace('/settings');
    }
  };

  const { open, ready, error } = usePlaidLink({
    token: linkToken ?? '',
    receivedRedirectUri: typeof window !== 'undefined' ? window.location.href : '',
    onSuccess,
    onExit: () => router.replace('/settings'),
  });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);
  useEffect(() => { if (error) setStatus('error'); }, [error]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {status === 'error' ? 'Could not complete bank connection. Return to Settings and try again.' : 'Finishing bank connection…'}
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev:web`, log in, navigate directly to `http://localhost:3000/settings/plaid-oauth-redirect`.
Expected: page renders the Sidebar plus "Could not complete bank connection..." (since there's no `plaidLinkToken` in `sessionStorage` on a direct visit) — confirms the route exists and the no-token fallback works. Full end-to-end OAuth continuation can only be exercised against a real OAuth-requiring institution in Plaid production (Task 12's config), not sandbox.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/settings/plaid-oauth-redirect/page.tsx
git commit -m "feat(web): add Plaid Link OAuth redirect landing page"
```

---

## Task 11: Document the Plaid env vars

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the Plaid env vars to the Environment section**

In `CLAUDE.md`, in the ` ```  ` env var block under `## Environment`, add these lines (the first three already exist as used env vars but were never documented; the last two are new from this plan):

```
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV                 # sandbox | development | production
PLAID_WEBHOOK_URL          # e.g. https://<host>/api/plaid/webhook — enables automatic sync
PLAID_OAUTH_REDIRECT_URI   # e.g. https://<host>/settings/plaid-oauth-redirect — must also be
                            # registered in the Plaid dashboard's Allowed redirect URIs
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Plaid environment variables"
```

---

## Task 12: Production config handoff (no code — reference for the user)

**Files:** none — this task produces no diff. It's the checklist from the spec's §6, restated here so it isn't lost between the spec and the deployed app.

- [ ] **Step 1: Confirm with the user before touching deploy config**

This plan's code changes are complete after Task 11. Going live against real bank data additionally requires, in `deploy/ci-deploy.sh` (which the user runs themselves — see project convention: GCP/deploy commands aren't run by the assistant):

| Var | Value |
|---|---|
| `PLAID_ENV` | `production` |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | Production credentials from the Plaid dashboard |
| `PLAID_WEBHOOK_URL` | `https://cofre-web-4rcapvhcga-uc.a.run.app/api/plaid/webhook` |
| `PLAID_OAUTH_REDIRECT_URI` | `https://cofre-web-4rcapvhcga-uc.a.run.app/settings/plaid-oauth-redirect` (must also be added to the Plaid dashboard's Allowed redirect URIs) |

Also: any sandbox `PlaidItem` rows in the production DB won't work once `PLAID_ENV=production` (sandbox access tokens are invalid there) — clear test connections first.

Local `.env` stays on `PLAID_ENV=sandbox` — no code change needed for that, it's just what's already in the untracked `.env` file today.
