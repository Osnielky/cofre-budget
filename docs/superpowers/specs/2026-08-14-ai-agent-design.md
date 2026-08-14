# AI Agent (Chat + Tool-Calling)

**Date:** 2026-08-14
**Status:** Approved for planning

## Problem

Cofre has no way for a user to interact with their finances in natural language. Categorizing transactions, creating categories, and tracking progress toward the net-worth goal all require manual UI navigation. There's also no way to just ask a question ("how much did I spend on dining last month?") without digging through the dashboard.

## Goal

Add a chat-based AI agent, backed by the Claude API, that can:
1. Answer questions about the user's transactions, categories, budgets, accounts, debts, and net-worth goal — including a rich savings-trend chart embedded directly in a reply when relevant.
2. Propose categorizing transactions, creating new categories, setting/updating category budgets, and setting the net-worth goal's target date — each requiring explicit user confirmation before anything is written.
3. Let the user undo a confirmed categorization change after the fact, and see at a glance what the agent is and isn't allowed to touch.

**Design reference:** a mockup (provided in conversation) drove the page layout, the permissions panel, the recent-changes/undo log, and the savings-trend widget described below. Treat this doc as the source of truth for scope and behavior; the mockup is the visual reference.

## Non-goals (v1)

- Fully autonomous actions with no confirmation step — every write goes through a propose → confirm flow.
- Deleting or bulk-editing existing categories/budgets via the agent.
- Undo for anything other than categorization — category/budget/goal changes remain manually editable (no dedicated undo button for those in v1).
- Any capability to move money or pay bills — never exposed, not even behind confirmation. The permissions panel says so explicitly.
- A general-purpose charting capability — only the one savings-trend widget described below, not an arbitrary "agent picks a chart type" system.
- Conversation compaction/summarization for very long chats.
- Any capability beyond what the propose-tools below cover — no debt management, no Plaid actions, no receipts.

## Dependency

`propose_set_net_worth_target_date` calls the net-worth-goal service described in `2026-08-14-net-worth-goal-design.md`. **That feature must be implemented first** — this spec assumes `GET/PATCH /net-worth-goal` already exists.

## Architecture

New dedicated page at `/ask-cofre` (not a docked panel) with a "Ask Cofre" entry in the sidebar nav, following the mockup's three-column layout: the existing global `Sidebar`, a center chat column, and a right-hand info column (permissions panel + recent-changes log). Backed by a new NestJS module `apps/api/src/ai-agent/`, using `@anthropic-ai/sdk`'s beta **Tool Runner** (`client.beta.messages.toolRunner`) to drive the tool-call loop — each tool is a plain async function, no hand-rolled loop needed.

- **Model:** `claude-sonnet-5`, `thinking: {type: "adaptive"}`, `output_config: {effort: "medium"}`. Chosen for near-Opus quality at a fraction of the cost, appropriate for a single-user hobby-scale app (see cost discussion in conversation — API billing is separate from any claude.ai subscription).
- **Key design choice — tools never mutate sensitive data directly.** Read tools query the DB and return data. Write-shaped tools (categorize, create category, set budget, set net-worth target date) don't touch real rows — they insert an `AiPendingAction` and return a "proposal created" acknowledgment to the model. The actual mutation happens later, only when the user clicks **Confirm** in the UI. This satisfies "confirm before acting" without any approval-gate machinery inside the tool loop itself — proposing *is* the tool's real, safe effect.
- **Streaming:** the Tool Runner is constructed with `stream: true`; the API endpoint relays text deltas to the client over SSE.
- **Structured reply content:** an assistant message's `content` isn't limited to text — it can embed one typed block the frontend renders specially: a **proposal card** (from a `propose_*` tool call) or a **savings-trend widget** (from `get_savings_trend`). Everything else renders as plain text.

## Data model

Three new entities in `apps/api/src/ai-agent/`, each scoped by `userId` (directly or via `conversationId`), following the existing entity conventions (`uuid` PKs, `ManyToOne` + `onDelete: 'CASCADE'` to `User`):

**`AiConversation`**

| Field | Type |
|---|---|
| `id` | uuid |
| `userId` | string + `ManyToOne User` |
| `title` | string, nullable (first user message truncated, or user-renamed later) |
| `createdAt` / `updatedAt` | timestamp |

**`AiMessage`**

| Field | Type |
|---|---|
| `id` | uuid |
| `conversationId` | uuid + `ManyToOne AiConversation`, `onDelete: 'CASCADE'` |
| `role` | `'user' \| 'assistant' \| 'tool'` |
| `content` | text or JSON (assistant messages may embed a reference to a pending action for the UI to render as a card) |
| `createdAt` | timestamp |

**`AiPendingAction`**

| Field | Type |
|---|---|
| `id` | uuid |
| `conversationId` | uuid + `ManyToOne AiConversation`, `onDelete: 'CASCADE'` |
| `messageId` | uuid + `ManyToOne AiMessage` — the assistant message that proposed it |
| `type` | `'categorize_transactions' \| 'create_category' \| 'set_budget' \| 'set_net_worth_target_date'` |
| `payload` | JSON — the proposed args (e.g. `{ transactionIds, categoryId }`) |
| `status` | `'pending' \| 'confirmed' \| 'rejected'` |
| `undoPayload` | JSON, nullable — only set for confirmed `categorize_transactions` actions: `{ transactions: { transactionId, previousCategoryId }[] }`, captured at confirm time, before the mutation is applied |
| `undoneAt` | timestamp, nullable |
| `createdAt` / `resolvedAt` | timestamp |

`undoPayload`/`undoneAt` only ever apply to `categorize_transactions` — every other type leaves them `null` and has no undo affordance, per the v1 scope decision above.

## Tools

**Read (auto-executed, no confirmation, scoped to `req.user.id`):**

| Tool | Args | Returns |
|---|---|---|
| `get_transactions` | `startDate?, endDate?, categoryId?, uncategorizedOnly?, merchant?, limit?` | Matching transactions (via `TransactionsService`) |
| `get_categories` | — | All categories with `wantNeed`, type |
| `get_budgets` | `month?` | Budgets with spend-vs-target |
| `get_net_worth_summary` | — | Current net worth breakdown + goal progress (reuses `GET /net-worth-goal`) |
| `get_accounts` | — | Bank accounts with balances |
| `get_debts` | — | Open/closed debts |
| `get_savings_trend` | — | Last 6 months of net-saved-per-month (reuses the existing `monthlyCashFlow` logic already computed for the dashboard), plus a linear projection to the end of the current month and the 6-month average. Powers the savings-trend widget below. |

**Propose (creates an `AiPendingAction`, never mutates directly):**

| Tool | Args | Notes |
|---|---|---|
| `propose_categorize_transactions` | `transactionIds: string[], categoryId: string` | Ownership of every transaction and the category is verified before the proposal is created |
| `propose_create_category` | `name, type, wantNeed?, icon?, color?` | |
| `propose_set_budget` | `categoryId, month, amount` | Creates or updates the `Budget` row for that category/month |
| `propose_set_net_worth_target_date` | `targetDate` | Calls into the net-worth-goal module's logic (but does not call `PATCH` yet — that happens on confirm) |

Every propose-tool's `run()` function returns a short acknowledgment string plus the created `AiPendingAction.id`, so the model can reference it in its reply (e.g. "I've proposed categorizing these 12 transactions as Dining — confirm below.").

## API

All under `JwtAuthGuard`, scoped to `req.user.id`:

- **`POST /api/ai/conversations`** — create a new conversation.
- **`GET /api/ai/conversations`** — list the user's conversations (id, title, updatedAt).
- **`GET /api/ai/conversations/:id/messages`** — full message history, including any embedded pending-action references.
- **`POST /api/ai/conversations/:id/messages`** — body `{ content: string }`. Appends the user message, runs the tool loop, streams the assistant's response back over SSE. On completion, persists the assistant's message (and any `AiPendingAction` rows created during the turn).
- **`POST /api/ai/actions/:id/confirm`** — loads the pending action (ownership-checked via its conversation), re-validates the payload against current data (e.g. the transactions still exist and are still uncategorized), executes the real mutation through the existing service (`TransactionsService`, `CategoriesService`, `BudgetsService`, or the net-worth-goal service), marks it `confirmed`, and appends a result message to the conversation. For `categorize_transactions`, also snapshots each transaction's pre-mutation `categoryId` into `undoPayload` before applying the change.
- **`POST /api/ai/actions/:id/reject`** — marks `rejected`, appends a short note to the conversation. No mutation.
- **`POST /api/ai/actions/:id/undo`** — only valid for a `categorize_transactions` action that is `confirmed` and not yet undone; otherwise 400. For each entry in `undoPayload`, restores the transaction's `categoryId` to `previousCategoryId` **only if its current `categoryId` still matches what this action set it to** (see Edge cases — don't clobber a newer manual/rule-based change). Sets `undoneAt`, returns how many of the entries were actually reverted vs. skipped.
- **`GET /api/ai/actions/recent`** — the user's confirmed, not-undone `categorize_transactions` actions across all conversations, most recent first (capped, e.g. 20), for the "Recent changes" panel. Each entry includes a display label (see Frontend) and the data needed to render the Undo button.

## Frontend

**Page:** `apps/web/src/app/ask-cofre/page.tsx`, following the `Sidebar` + main-content layout convention used elsewhere, extended with a right-hand info column. A new "Ask Cofre" entry (lightning-bolt icon) is added to `Sidebar.tsx`'s `NAV` array, after Dashboard.

- **`useAiChat` hook** (`apps/web/src/hooks/`) — manual `fetch(..., { credentials: 'include' })` against the new endpoints, consuming the SSE stream for live text, matching the style of `useDashboardData.ts` (no react-query).
- **Chat column:**
  - Header: "Ask Cofre" title, subtitle ("Reads your whole account. Asks before it changes anything."), History and New Chat controls.
  - Messages render as text by default; a message carrying a proposal renders an inline card ("Categorize 12 transactions as Dining?") with Confirm/Reject buttons wired to the action endpoints, updating in place to reflect the resolved status; a message carrying `get_savings_trend` output renders the **savings-trend widget** — a small bar chart (reusing `chartTheme`/`useThemeColors`, matching the dashboard's chart conventions) with "Projected [month-end]" and "6-month avg" stat callouts, plus quick-fact pills (transaction count, account count, months of history).
  - A fixed row of suggested-prompt chips above the input (static examples — clicking one fills the input, doesn't auto-send).
  - Input bar: text input, a month selector (sets a lightweight "the user is focused on [month]" context hint sent alongside the next message — not wired into any tool's default arguments), send button.
- **Right column:**
  - **Permissions panel** ("What Cofre can touch") — a static reference card, not backed by new logic, worded to match the actual tool set (no mention of "rules" — there's no rule-creation tool here): Read everything (always on), Categories & budgets and Categorize transactions (asks first), Move money or pay bills (never).
  - **Recent changes panel** — lists entries from `GET /api/ai/actions/recent`, each as `"<label>"` with a relative timestamp (e.g. "Yesterday") and an Undo button; a "Full log" link shows the same list unpaginated. The display label is generated when the action is confirmed: if every transaction shares the same merchant, `"<count> <merchant> charges → <category>"`; otherwise `"<count> transactions → <category>"`.
- **Conversation history** — a simple list/switcher (New Chat vs. resume a past conversation), driven by `GET /api/ai/conversations`.

## Edge cases

- **Proposal stale by the time it's confirmed** (e.g. a categorization rule already categorized one of the transactions): the confirm endpoint re-validates against current state and reports what actually changed, rather than blindly reapplying the original payload.
- **Tool call referencing another user's data**: rejected the same way every other service call is — ownership check fails, tool returns an error result the model can relay.
- **User sends a new message while a previous turn's proposal is still pending**: allowed: proposals persist independently of the conversation turn and can be confirmed/rejected at any time.
- **Anthropic API error/timeout mid-stream**: the partial assistant message is discarded (not persisted), and the endpoint returns an error the UI surfaces as "something went wrong, try again."
- **Undo target changed since confirmation** (a categorization rule or manual edit recategorized one of the transactions after the AI action confirmed): the undo endpoint only reverts transactions whose *current* `categoryId` still matches what the action set — anything changed since is left alone, and the response reports the partial result (e.g. "Reverted 8 of 9 — one was recategorized since"). The UI surfaces that partial outcome rather than claiming a full undo.
- **Undo requested twice, or on an already-rejected/never-confirmed action**: 400 — `undoneAt` already set, or `status !== 'confirmed'`.

## Testing plan

No automated test runner configured; verify manually against the running app:
1. Ask a read-only question ("how much did I spend on dining last month?") → confirm the answer matches the transactions page.
2. Ask the agent to categorize a batch of uncategorized transactions → confirm the proposal card appears, Confirm applies it correctly, Reject leaves transactions untouched.
3. Ask the agent to create a new category → confirm the proposal, verify it appears in Settings afterward.
4. Ask the agent to set a budget for a category → confirm via the proposal, verify on the Budgets page.
5. Ask the agent to set the net-worth goal's target date → confirm via the proposal, verify on the `/goals` page.
6. Start a conversation, refresh the page, confirm history persists and switching conversations resumes each correctly.
7. Ask a question the agent answers with the savings-trend widget (e.g. "how much am I saving this month, and is that better or worse than usual?") → confirm the chart, projection, average, and quick-fact pills render and match the dashboard's own numbers.
8. Categorize a batch of transactions via the agent, confirm it, then Undo from the Recent Changes panel → confirm all transactions revert to their prior category and the entry disappears (or marks itself undone).
9. Manually recategorize one transaction from a just-confirmed batch (outside the agent), then Undo the batch → confirm the manually-changed one is left alone and the response reports a partial revert.
10. Confirm the permissions panel's claims are actually true: try to get the agent to do something outside its tool set (e.g. "pay my credit card bill") and confirm it can't — there's no tool for it.
11. Check the `/ask-cofre` page in both light/dark themes and at mobile width.
