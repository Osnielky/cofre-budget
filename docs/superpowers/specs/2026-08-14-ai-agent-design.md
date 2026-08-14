# AI Agent (Chat + Tool-Calling)

**Date:** 2026-08-14
**Status:** Approved for planning

## Problem

Cofre has no way for a user to interact with their finances in natural language. Categorizing transactions, creating categories, and tracking progress toward the net-worth goal all require manual UI navigation. There's also no way to just ask a question ("how much did I spend on dining last month?") without digging through the dashboard.

## Goal

Add a chat-based AI agent, backed by the Claude API, that can:
1. Answer questions about the user's transactions, categories, budgets, accounts, debts, and net-worth goal.
2. Propose categorizing transactions, creating new categories, setting/updating category budgets, and setting the net-worth goal's target date — each requiring explicit user confirmation before anything is written.

## Non-goals (v1)

- Fully autonomous actions with no confirmation step — every write goes through a propose → confirm flow.
- Deleting or bulk-editing existing categories/budgets via the agent.
- Conversation compaction/summarization for very long chats.
- Any capability beyond what the propose-tools below cover — no debt management, no Plaid actions, no receipts.

## Dependency

`propose_set_net_worth_target_date` calls the net-worth-goal service described in `2026-08-14-net-worth-goal-design.md`. **That feature must be implemented first** — this spec assumes `GET/PATCH /net-worth-goal` already exists.

## Architecture

New NestJS module `apps/api/src/ai-agent/`, using `@anthropic-ai/sdk`'s beta **Tool Runner** (`client.beta.messages.toolRunner`) to drive the tool-call loop — each tool is a plain async function, no hand-rolled loop needed.

- **Model:** `claude-sonnet-5`, `thinking: {type: "adaptive"}`, `output_config: {effort: "medium"}`. Chosen for near-Opus quality at a fraction of the cost, appropriate for a single-user hobby-scale app (see cost discussion in conversation — API billing is separate from any claude.ai subscription).
- **Key design choice — tools never mutate sensitive data directly.** Read tools query the DB and return data. Write-shaped tools (categorize, create category, set budget, set net-worth target date) don't touch real rows — they insert an `AiPendingAction` and return a "proposal created" acknowledgment to the model. The actual mutation happens later, only when the user clicks **Confirm** in the UI. This satisfies "confirm before acting" without any approval-gate machinery inside the tool loop itself — proposing *is* the tool's real, safe effect.
- **Streaming:** the Tool Runner is constructed with `stream: true`; the API endpoint relays text deltas to the client over SSE.

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
| `createdAt` / `resolvedAt` | timestamp |

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
- **`POST /api/ai/actions/:id/confirm`** — loads the pending action (ownership-checked via its conversation), re-validates the payload against current data (e.g. the transactions still exist and are still uncategorized), executes the real mutation through the existing service (`TransactionsService`, `CategoriesService`, `BudgetsService`, or the net-worth-goal service), marks it `confirmed`, and appends a result message to the conversation.
- **`POST /api/ai/actions/:id/reject`** — marks `rejected`, appends a short note to the conversation. No mutation.

## Frontend

- **`ChatPanel.tsx`** — a docked panel (not a full page), openable from anywhere in the app, following the existing modal/panel visual conventions (glass surface, theme variables).
- **`useAiChat` hook** (`apps/web/src/hooks/`) — manual `fetch(..., { credentials: 'include' })` against the new endpoints, consuming the SSE stream for live text, matching the style of `useDashboardData.ts` (no react-query).
- **Proposal cards** — when an assistant message embeds a pending-action reference, render it as an inline card (e.g. "Categorize 12 transactions as Dining?") with Confirm/Reject buttons calling the action endpoints; the card updates in place to reflect the resolved status.
- **Conversation history** — a simple list/switcher (new conversation vs. resume a past one).

## Edge cases

- **Proposal stale by the time it's confirmed** (e.g. a categorization rule already categorized one of the transactions): the confirm endpoint re-validates against current state and reports what actually changed, rather than blindly reapplying the original payload.
- **Tool call referencing another user's data**: rejected the same way every other service call is — ownership check fails, tool returns an error result the model can relay.
- **User sends a new message while a previous turn's proposal is still pending**: allowed: proposals persist independently of the conversation turn and can be confirmed/rejected at any time.
- **Anthropic API error/timeout mid-stream**: the partial assistant message is discarded (not persisted), and the endpoint returns an error the UI surfaces as "something went wrong, try again."

## Testing plan

No automated test runner configured; verify manually against the running app:
1. Ask a read-only question ("how much did I spend on dining last month?") → confirm the answer matches the transactions page.
2. Ask the agent to categorize a batch of uncategorized transactions → confirm the proposal card appears, Confirm applies it correctly, Reject leaves transactions untouched.
3. Ask the agent to create a new category → confirm the proposal, verify it appears in Settings afterward.
4. Ask the agent to set a budget for a category → confirm via the proposal, verify on the Budgets page.
5. Ask the agent to set the net-worth goal's target date → confirm via the proposal, verify on the `/goals` page.
6. Start a conversation, refresh the page, confirm history persists and reopening the panel resumes it.
7. Check the chat panel in both light/dark themes and at mobile width.
