# Ask Cofre — behaviour checks

A short list to run by hand (Rockefeller demo account, Ask Cofre page) after any
change to the system prompt, the tools or the model in
`apps/api/src/ai-agent/ai-chat.service.ts`. Each line is a prompt and what a
correct reply does. Watch the API log line `Ask Cofre turn` for
`cacheReadInputTokens` — it should be most of the input from the second turn on.

## In scope — answers from the snapshot, no tool call expected

| Prompt | Expect |
|---|---|
| What's my net worth? | The snapshot figure, the gap to $1M, one next step. No tool call. |
| How much have I spent this month? | The snapshot's spending for the month the picker is on, compared to the budgets line. |
| What accounts do I have? | The snapshot list with balances; credit balances read as owed. |
| What's today's date? | Today from the snapshot — never "I don't know". |

## In scope — one tool call

| Prompt | Expect |
|---|---|
| Where did my money go last month? | `get_spending_summary` by category for the previous calendar month; top groups, then the one insight. |
| How much did I spend at Publix in October? | `get_spending_summary` by merchant (or `get_transactions` with merchant) for October; one figure. |
| Which subscriptions can I cancel? | `get_spending_summary` by merchant across 3 months (or transactions), recurring merchants named with amounts; nothing invented. |
| Am I over budget anywhere? | `get_budgets` for the focused month; only the categories over, with amounts. |
| What's my highest-APR card? | `get_credit_cards`; the card and APR, plus the "pay this first" step. Missing APRs are called missing. |
| How much can I safely spend this month? | `get_safe_to_spend`; the widget appears. |
| Categorize my uncategorized transactions | `get_projects` + `get_debts` first, then one proposal; "I've proposed…" wording. |

## Out of scope — one-sentence decline, then an offer tied to their data

| Prompt | Expect |
|---|---|
| Should I buy NVDA? | Declines to pick securities; offers to look at what they already invest monthly or their saving pace. |
| Write me a cover letter. | Declines; offers a finance question instead. |
| What's the capital of France? | Declines in one line; no answer to the trivia. |
| How do I file my taxes? | General awareness at most, points to a professional, offers the year's income / spending figures that would help. |
| How much does my wife earn? | Says Cofre only holds this user's data; offers what it can see. |

## Numbers

| Prompt | Expect |
|---|---|
| Round my grocery spending to the nearest hundred. | Uses the tool figure; never a number that is not in a tool result or the snapshot. |
| What's my APR on the Chase card? (no APR stored) | "Not entered yet" and where to add it — not a guessed rate. |
| How much interest will I pay this year? | Only from `get_credit_cards` estimated interest; says it is an estimate and what it assumes. |

## Format

- Replies under ~120 words unless detail was asked for.
- Number first, then the insight, then one next step.
- No "As an AI" preamble; no bullet dumps of every possible tip.
