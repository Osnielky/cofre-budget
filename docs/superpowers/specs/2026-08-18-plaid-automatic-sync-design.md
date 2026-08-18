# Plaid automatic sync & production readiness

**Date:** 2026-08-18
**Status:** Approved, pending implementation

## Context

Cofre already has a working Plaid integration: `PlaidService` (link token, token exchange,
manual resync), the `Connect Bank` button in Settings → Bank Accounts using
`usePlaidLink`, and encrypted-at-rest access tokens. It runs against Plaid sandbox today.

Two gaps prevent this from being a real "connect once and transactions arrive
automatically" feature:

1. **Sync is manual only.** Nothing pushes updates — a user has to click "Sync" per
   account. There is no webhook handling and no scheduled job.
2. **It only works in Plaid sandbox.** Production Plaid access is already approved
   (external, done outside this repo), but the app doesn't yet handle: Plaid's OAuth
   redirect flow required by major banks (Chase, BofA, Wells Fargo, ...), item error /
   re-auth states, or production env wiring.

This spec covers both: automatic, webhook-driven sync, and the changes needed to run
against real bank data in production.

## Goals

- New transactions land automatically after Plaid notifies us — no manual click needed.
- Works with real institutions in production, including ones that require Plaid's OAuth
  redirect flow.
- When a connected bank needs re-authentication (expired login, changed password), the
  user sees a "Reconnect" action instead of silent, permanently-broken sync.
- No polling / cron — webhook-only, since it avoids Plaid API calls for accounts with no
  new activity (the user's explicit preference, favoring the lower-cost approach).

## Non-goals

- Changing the existing `RequiresPlan('pro')` gate on Plaid endpoints — left as-is.
- A cron/polling fallback for missed webhooks — out of scope for this iteration.
- Supporting Plaid products beyond `transactions` (no Auth, Identity, Investments, etc).

## Design

### 1. Data model

`PlaidItem` (`apps/api/src/plaid/plaid-item.entity.ts`) gains:

- `cursor: string | null` — Plaid's `/transactions/sync` pagination cursor.
- `status: string` (`'active' | 'error'`, default `'active'`).
- `errorCode: string | null` — Plaid's `error_code` when `status = 'error'` (e.g.
  `ITEM_LOGIN_REQUIRED`), used to drive the Settings UI.

Schema updates automatically via TypeORM's `synchronize` (existing project convention —
see the `3f63620` commit for precedent).

### 2. Sync engine: migrate to `/transactions/sync`

Replace the current `transactionsGet`-based `syncTransactions()` (re-fetches a rolling
90-day window every call) with Plaid's cursor-based `/transactions/sync`. Both the
initial sync (after `exchangeToken`) and every subsequent sync (webhook-triggered or
manual "Sync" button) call the same method:

- Page through `client.transactionsSync({ access_token, cursor })` until `has_more` is
  false, accumulating `added` / `modified` / `removed`.
- **added** → create `Transaction` rows (same `externalId` + `userId` dedup and
  categorization-rule matching as today).
- **modified** → update the existing row found by `externalId` + `userId`.
- **removed** → delete the row found by `externalId` + `userId` (covers pending→posted
  transitions and true removals).
- Persist the returned `next_cursor` onto `PlaidItem.cursor` after each full page-through.
- On success, also clear `status`/`errorCode` back to `active` (a successful sync implies
  the item is healthy).

The manual "Sync" button in Settings keeps working unchanged — it just calls into the
same cursor-based method on demand.

### 3. Webhook endpoint

New `PlaidWebhookController` (`apps/api/src/plaid/plaid-webhook.controller.ts`), separate
from the existing authenticated `PlaidController` — Plaid calls this server-to-server
with no user session, so it carries no `JwtAuthGuard`/`PlanGuard`.

**`POST /api/plaid/webhook`**

1. **Verify the caller is Plaid.** Plaid signs webhooks with a JWT in the
   `Plaid-Verification` header (ES256). Steps: decode the JWT header for `kid`, fetch (and
   cache in-memory by `kid`) the verification key via
   `client.webhookVerificationKeyGet({ key_id })`, verify the JWT signature, check `iat` is
   within ~5 minutes (replay protection), and compare the JWT's
   `request_body_sha256` claim against a SHA-256 hash of the **raw** request body.
   - This requires the raw body bytes, not the parsed object. `apps/api/src/main.ts`
     already applies `express.json()` manually (`bodyParser: false` on `NestFactory`) —
     add a `verify: (req, res, buf) => { req.rawBody = buf }` callback there. This is
     global but harmless to every other route.
   - Verification failure → `401`.
2. **Dispatch on `webhook_type` / `webhook_code`:**
   - `TRANSACTIONS` / `SYNC_UPDATES_AVAILABLE` → look up `PlaidItem` by `item_id`, run the
     cursor-based sync (§2).
   - `ITEM` / `ERROR` → set `status = 'error'`, `errorCode = payload.error.error_code`.
   - `ITEM` / `PENDING_EXPIRATION` or `PENDING_DISCONNECT` → same treatment (needs
     reconnect).
   - Anything else → `200` no-op (must still ack, or Plaid retries).

**Registration:** `createLinkToken()` passes `webhook: PLAID_WEBHOOK_URL` (new env var)
so every newly-created Item is wired up at creation time. No cron job anywhere.

### 4. OAuth redirect flow (required for real banks)

Institutions like Chase, BofA, and Wells Fargo force Plaid Link through their own OAuth
login page, which navigates the browser away and back. The current
`usePlaidLink` wiring in `apps/web/src/app/settings/page.tsx` has no handling for the
"return" half of that trip — sandbox test institutions never exercise this path, so it
would silently break in production.

- `createLinkToken()` passes `redirect_uri: PLAID_OAUTH_REDIRECT_URI` (new env var). The
  exact URL must also be registered as an "Allowed redirect URI" in the Plaid dashboard.
- Before calling `open()`, persist the `link_token` to `sessionStorage` (the page reloads
  on redirect, so React state doesn't survive the round trip).
- New route `apps/web/src/app/settings/plaid-oauth-redirect/page.tsx`: on load, reads the
  stored `link_token`, re-initializes
  `usePlaidLink({ token, receivedRedirectUri: window.location.href, onSuccess })`, then
  routes back to Settings → Bank Accounts. Stays behind the existing auth middleware like
  any other page.

### 5. Reconnect UI

When `PlaidItem.status === 'error'`, the connected account's card in Settings → Bank
Accounts shows a "Reconnect" action (alongside "Sync"):

- `bank-accounts` list response needs to surface the item's `status` so the UI can
  render the badge/action (join through `plaidItemId`).
- New endpoint `POST /plaid/reconnect-token/:itemId` → `linkTokenCreate` in **update
  mode** (`access_token` instead of `products`), returns a link token.
- Reuses the same `usePlaidLink` flow; `onSuccess` calls a new endpoint
  `POST /plaid/reconnect/:itemId/complete` which clears `status`/`errorCode` back to
  `active` and triggers a sync.

### 6. Production config

New env vars (local `.env` stays on sandbox values; production values go in
`deploy/ci-deploy.sh` alongside the existing Google/Resend secrets — see
[[deployment-gcp]] for that pattern):

| Var | Value |
|---|---|
| `PLAID_ENV` | `production` (deployed only; local stays `sandbox`) |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | Production credentials from the Plaid dashboard |
| `PLAID_WEBHOOK_URL` | `https://cofre-web-4rcapvhcga-uc.a.run.app/api/plaid/webhook` |
| `PLAID_OAUTH_REDIRECT_URI` | `https://cofre-web-4rcapvhcga-uc.a.run.app/settings/plaid-oauth-redirect` — must also be added to the Plaid dashboard's allowed redirect URIs |

Existing sandbox `PlaidItem` rows won't work once production is live (sandbox access
tokens are invalid there) — worth clearing test connections before flipping the env.

The user runs all `gcloud`/deploy commands themselves — this repo's changes stop at
providing the env var names/values and updating `deploy/ci-deploy.sh`'s variable list;
actually setting secrets and deploying is on the user.

## Testing

- Sandbox: use Plaid's sandbox webhook-fire endpoint (`/sandbox/item/fire_webhook`) to
  simulate `SYNC_UPDATES_AVAILABLE` and confirm transactions land without pressing Sync.
- Verify webhook signature check rejects a request with a missing/invalid
  `Plaid-Verification` header.
- Force an `ITEM_LOGIN_REQUIRED` via Plaid sandbox's `/sandbox/item/reset_login` and
  confirm the Settings UI shows Reconnect and that completing update-mode Link clears it.
- Manual "Sync" button still works post-migration to `/transactions/sync`.
