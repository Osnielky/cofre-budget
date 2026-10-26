# Cofre go-to-market plan

Written 2026-10-26. Owner: Osnielky. Review every Monday; move items between
"Doing", "Done" and "Next" as they happen. Nothing here is a feature spec: the
things that need code have their own spec in
`docs/superpowers/specs/2026-10-26-growth-pages-design.md`.

## Positioning

**One sentence:** Cofre is the free budgeting app with an AI that answers your
money questions, for people who left Mint and find Monarch or YNAB too expensive.

**Why this wedge:** Mint closed in 2024 and every alternative that absorbed its
users charges $95 to $109 a year with no free plan (Monarch $99.99/yr, YNAB
$109/yr, Copilot $95/yr; Rocket Money has a free tier but its Premium slider is
$7 to $14 a month). Cofre's Free plan is free forever and Pro is $4.99 a month.
That is a price people search for.

**Secondary hooks:** Ask Cofre (plain-English answers from real numbers) and the
Road to $1M (the shareable progress loop).

**Hard rules:** every public claim must appear in the landing spec's "Allowed
claims" (`docs/superpowers/specs/2026-09-30-landing-page-design.md`). No user
counts, no testimonials, no ratings and no "bank-level security" until they are
real and the spec is updated.

**Audience to name when writing copy:** a 28 to 42 year old US salaried worker
with two or three bank accounts and one or two credit cards, who used Mint,
tried Monarch's trial, and did not want to pay $100 a year for a budget.

## Assets already live

| Asset | Where | Use it for |
|---|---|---|
| Landing page with SEO metadata, sitemap, Open Graph image, JSON-LD | budgetcofre.com | every link |
| Public demo (per-visitor sandbox, 4 h) and Rockefeller login | `/demo` | the CTA in every post: no signup needed |
| Free forever plan, Pro and Elite with a 15-day trial | `/pricing` | the price hook |
| Admin Traffic panel: visitors, pages, referrers, prospects profile, `utm_*` tags, landing to demo to signup funnel | `/admin` | attribution; now also trial starts and paid |
| Mail service (Resend) | API | transactional mail today, onboarding drip later |

## Phase 1: first 30 days, free channels

Goal: the first 200 signups and the first paying users, and knowing which
channel sent them.

### Week 1: measurement and materials

- [ ] Add budgetcofre.com to Google Search Console and Bing Webmaster Tools;
      submit `https://budgetcofre.com/sitemap.xml`.
- [ ] Tag every outbound link: `?utm_source=<channel>&utm_medium=<post|profile|listing>&utm_campaign=launch-2026-10`.
      The admin Traffic panel attributes entry views to the campaign.
- [ ] Record a 60 to 90 second screen video: link a bank, ask Cofre "where did
      my money go this month", open the Road to $1M. Export 1080p and a 30 s cut
      for social.
- [ ] Five screenshots at 1440 wide on the Cobalt theme: dashboard, transactions,
      Ask Cofre, budgets, goals. Use the demo account so the data is clean.
- [ ] Write the launch copy once and reuse it (see Copy bank below).

### Week 2: directory listings

Each listing is a backlink plus a trickle of search traffic for months. Use the
same name, tagline, logo (`apps/web/public/logo-1024.png`) and screenshots.

- [ ] AlternativeTo: list Cofre as an alternative to Mint, Monarch Money, YNAB,
      Copilot Money, Rocket Money.
- [ ] SaaSHub, Product Hunt (as "upcoming" first), BetaList, Uneed, Peerlist
      launchpad, Indie Hackers product page.
- [ ] G2 and Capterra (free listings; they rank for "<app> alternatives").
- [ ] Google Business Profile for Osmio Services with the website (helps the
      brand query).

### Week 3: launch week (Tuesday to Thursday)

- [ ] Tuesday: Product Hunt. Tagline "Free budgeting with an AI that answers
      your money questions". Gallery: video first, then the five screenshots.
      First comment: who built it, why (Mint closing), what is free, link to the
      demo. Reply to every comment within the hour.
- [ ] Wednesday: Show HN: "Show HN: Cofre, a free budget app with an AI you can
      ask about your money (Next.js, NestJS, Plaid, Claude)". The text explains
      the stack, how the AI only proposes changes, and how transfers are
      modelled. HN rewards honesty and technical detail.
- [ ] Thursday: Indie Hackers post and the r/SideProject post.
- [ ] Each day: answer questions in the thread, note feature requests in
      `docs/BACKLOG.md`.

### Week 4: communities, with disclosure

Never post an ad. Answer threads where someone asks for a Mint or Monarch
alternative, say you built Cofre, link the demo. Read each subreddit's rules
first; several ban self-promotion outright.

- Subreddits that allow disclosed self-promotion: r/MintuitAlternatives,
  r/budget, r/SideProject, r/Frugal (sparingly), r/povertyfinance (only if
  genuinely helpful, free plan angle).
- Skip r/personalfinance (no promotion) unless answering with no link.
- Facebook groups: "Mint alternatives", "Budgeting for beginners".
- X and Threads: post the 30 s clip, tag nothing, reply to people asking for
  app recommendations.

### First testimonials

- [ ] Email the first 20 real signups personally after two weeks: one question,
      "what made you try Cofre, and what would make you stay?". Ask permission
      to quote.
- [ ] Add quotes to the landing spec's allowed claims, then to the landing page.

## Phase 2: months 1 to 3, search traffic

Budgeting is a search category. These pages exist now (see the spec):

- `/tools/millionaire-calculator`, `/tools/credit-card-payoff-calculator`,
  `/tools/50-30-20-budget-calculator`: free, no login, end in a demo link.
- `/compare/monarch-money`, `/compare/ynab`, `/compare/copilot-money`,
  `/compare/rocket-money`, `/mint-alternative`: factual, dated prices.

Keep them earning:

- [ ] Re-check competitor prices on the first of each month; update
      `apps/web/src/lib/marketing/competitors.ts` (`pricesCheckedOn`).
- [ ] Submit each new page in Search Console after deploy.
- [ ] Blog on the same domain (`/blog`, not Medium): one post a week from real
      features. First ten titles:
      1. How to categorize transfers between your own accounts
      2. Is Plaid safe? What a budgeting app actually receives from your bank
      3. Credit card utilization: the number that moves your score
      4. What "safe to spend" means and how to compute it
      5. Mint is gone: how to import your Mint CSV into a free budget app
      6. 50/30/20 with real numbers: a worked example
      7. How to track net worth when half of it is a mortgage
      8. Recurring charges you forgot you pay for (and how to find them)
      9. Capital returns vs investment income: why your budget double-counts
      10. From $25K to $100K: what changed in the budget
- [ ] Internal links: every calculator links to the matching compare page and
      the blog post; every blog post links to one tool.

## Phase 3: months 2 to 4, loops inside the product

- [ ] **Referral program:** one free month of Pro for both sides. Needs a
      `referrals` table, a code on Settings, a Stripe coupon at checkout.
- [ ] **Milestone share card:** when a user reaches a Road to $1M level, offer
      a generated 1200x630 image ("Level 5: Six figures") for Reddit, X and
      Instagram. Net worth milestone posts are a staple of r/Fire.
- [ ] **Onboarding drip** through the existing mail service: day 0 welcome,
      day 2 "link a bank or import a CSV", day 7 "ask Cofre something", day 13
      "your trial ends tomorrow". Needs a scheduler (Cloud Scheduler hitting an
      admin endpoint is the simplest).
- [ ] **Trial-end nudge in app:** a banner three days before trial end.

## Phase 4: months 3 to 6, paid, only with numbers

Compute first, from the admin funnel: signups / landing visitors, trial starts /
signups, paid / trial starts. Then the cost per paid user has to stay under
about three months of Pro revenue ($15) for Google and under six months ($30)
for creators, since creator traffic retains better.

- Google Search ads, $10 to $20 a day, exact match only: "mint alternative
  free", "free budget app with bank sync", "budget app with ai". Land on
  `/mint-alternative` or `/demo`, never the homepage.
- Micro-creators on YouTube and TikTok (5k to 50k followers): $100 to $500 per
  sponsored mention or 30 percent revenue share for 12 months through Rewardful
  or Tolt.
- Newsletter sponsorships in small personal finance newsletters: $50 to $300 an
  issue.

## Known gaps

- **No app store presence.** Monarch, YNAB and Copilot are discovered in the
  App Store. The mobile-first spec in the backlog plus a Capacitor wrapper
  would fix it. Biggest discovery gap; separate project.
- **Spanish.** US Spanish-speaking households are underserved by every
  competitor and the name already works. Needs i18n; separate project.
- **Android users of Copilot** have nowhere to go; Cofre is a web app, so the
  Copilot compare page leads with that.

## Weekly scorecard

Fill from `/admin` Traffic and Stripe every Monday.

| Week | Visitors | Demo starts | Signups | Bank links | Trial starts | Paid | Top referrer |
|---|---|---|---|---|---|---|---|
| 2026-10-27 | | | | | | | |

## Copy bank

**Tagline (60 chars):** Free budgeting with an AI that answers your money questions.

**Short (160 chars):** Cofre tracks your budgets, cards and net worth. Free
forever for manual accounts and CSV import; Pro adds bank sync and Ask Cofre
for $4.99/mo.

**Product Hunt first comment:**

> Hi, I'm Osnielky, I built Cofre after Mint shut down and every alternative
> wanted $100 a year. The Free plan is free forever: unlimited manual accounts,
> CSV import, budgets, recurring charges, debts, projects and net worth. Pro
> ($4.99/mo, 15-day trial) adds automatic bank sync through Plaid and Ask
> Cofre, which answers questions like "where did my money go this month" from
> your real numbers and can only propose changes you confirm. You can try a
> full year of sample data without signing up: budgetcofre.com/demo. Happy to
> answer anything about the stack (Next.js, NestJS, Postgres, Plaid, Claude).

**Show HN title:** Show HN: Cofre, a free budget app with an AI you can ask about your money

**Reddit reply template (disclosed):**

> I built one (Cofre, budgetcofre.com), so take this with that in mind. The
> free plan covers manual accounts and CSV import, and the paid plan is $4.99/mo
> for Plaid sync and an AI that answers questions from your transactions. There
> is a demo with a year of sample data if you want to poke at it without
> signing up.
