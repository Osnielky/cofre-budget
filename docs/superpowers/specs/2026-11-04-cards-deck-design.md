# Cards deck — pick a card, see everything about it (2026-11-04)

## Goal

Replace the tile grid and the Credit / Debit / All tabs on `/cards` with a phone-first
picker: a 3D carousel of every card the user has, and under it everything Cofre knows
about the one that is selected. Bring in a small, reusable motion kit so the rest of
the app can move the same way.

## Decisions

- **One deck.** Credit cards first, then checking accounts shown as debit cards. Each card
  carries a CREDIT / DEBIT label; the detail under the deck changes with the kind.
- **Libraries** (all React 19 compatible, wrapped once in `components/motion/`):
  - Embla Carousel (`embla-carousel-react`, `embla-carousel-wheel-gestures`) — touch
    first snap carousel with inertia, mouse drag, trackpad / wheel, loop.
  - NumberFlow (`@number-flow/react`) — figures roll digit by digit.
  - Vaul (`vaul`) — bottom sheet on phones, side panel from `md`.
  - Motion (already installed) stays the orchestrator: panel enter / exit, tap feedback,
    stagger. Springs and travel in `lib/motion/tokens.ts`.
- **Reduced motion** collapses travel to a fade everywhere (`useReducedMotion`).
- **No issuer logos or card art** (trademarks). The deck card is the existing generic
  graphic grown to `size="lg"` with chip, contactless mark, masked number and bank.

## Layout

- Phone (below `sm`): header, deck (active card 72% wide, neighbours peeking from both
  edges), arrows + dots, the detail panel, then the summary tiles, then strategy.
- From `xl`: summary tiles first, then deck (sticky) left and detail right.
- The 3D pose: `slideTween(diff)` in `lib/cards/deck.ts` — centre card flat, neighbours
  at scale 0.9, 30° around their inner edge (the edge nearest the centre stays closest
  to the reader), opacity 0.6; clamped beyond one slide; per-slide perspective; the
  nearest slide paints on top.

## Detail panel

Credit: name, last 4, bank, synced / added by hand, CREDIT pill, Overdue pill; current
balance and available credit (or "Add a limit"); limit bar growing to the utilization
with the level colour; minimum payment / due date / rewards tiles; purchase, promo
(until), cash advance and balance transfer APRs, estimated monthly interest, statement
balance (date), last payment (date); the card's notice; one primary action (Enable card
details / Add details) and Edit details (hidden when the primary is Add details, same
form). Debit: available balance, spent this month, reconnect notice, View transactions.
Both end with a folded **Recent activity** list: the 8 newest transactions on the
account from `GET /transactions?accountId=&limit=8`, cached per account for the visit,
income green with a plus, expenses with a minus.

## API fix shipped with it

`listDebitForUser` bounded the month with `YYYY-MM-31`; Postgres rejects an invalid
date literal, so `/cards/debit` returned 500 every 30-day month and February.
`common/dates/month-bounds.ts` (tested) derives the real last day.

## Tests

`lib/cards/deck.test.ts`, `lib/motion/tokens.test.ts`, `common/dates/month-bounds.test.ts`;
visual check at 375 / 768 / 1440 with the headless browser.

## Follow-ups

See BACKLOG → Credit card expert → Card deck.
