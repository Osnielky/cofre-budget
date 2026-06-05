# 🏴‍☠️ Cofre — SaaS Product Plan
> Personal Finance Tracker · June 2026 · Built to be the best

---

## 🎯 Vision

**"The financial OS for people who want to actually get better with money."**

Not just tracking — understanding, improving, and acting. Cofre combines the rigor of YNAB, the polish of Copilot, the breadth of Monarch, and the accessibility of Rocket Money — without the price tag of any of them.

---

## 👤 Target User

### Primary: The Financially Aware Millennial / Gen Z (25–40)
- Has income, has debt, has goals — but no clear picture
- Tired of spreadsheets, tired of apps that just show them what they already know
- Wants to **improve**, not just track
- Likely tried Mint before it died (January 2024)
- Has multiple accounts: checking, savings, credit card, maybe a 401k
- Works across web + mobile
- **Geography:** Start US-focused, expand to Latam (massive underserved market)

### Secondary: Freelancers / Solopreneurs
- Blended personal + business finances
- Income variability makes budgeting harder
- Needs project-level P&L (Cofre already has this)
- No existing app serves this well

### Persona Summary
> "Maria, 32, software engineer. $90k salary, $28k student debt, renting.
> She tracks spending casually on her bank app but never knows where the month went.
> She wants to save for a house but doesn't have a plan.
> She tried YNAB once — it was too complicated. Mint died. She's looking."

---

## 🏆 Competitive Positioning

| Competitor | Their edge | Our answer |
|---|---|---|
| YNAB | Best methodology | Same rigor, way better UX, lower price |
| Monarch | Most features | Match features + add AI + better price |
| Rocket Money | Bill negotiation, free tier | Free tier + subscription management |
| Simplifi | Cheapest | Better features at same price |
| Copilot | Best design | Match design, add cross-platform |
| Cleo | Gen Z / AI | Real AI, not gimmicks |

**Our unfair advantages:**
1. **Price** — Full-featured at $7/mo vs $9–$17/mo competitors
2. **AI-first** — Real insights, not just categorization
3. **Projects** — P&L tracking for investments/assets (unique)
4. **International-ready** — CSV import with universal column mapper (already built)
5. **Design** — Glassmorphism, fast, beautiful — no one else looks like this

---

## 🔍 Market Gaps We Fill

| Gap | How Cofre fills it |
|---|---|
| AI + serious budgeting | AI insights + zero-based budgeting engine |
| Affordable + full-featured | $7/mo with full feature set |
| International users | Universal CSV import + multi-currency (roadmap) |
| Personal + freelance hybrid | Projects feature already built |
| Privacy-conscious users | Optional bank sync; CSV works without Plaid |
| Clean, fast UI | Glassmorphism design, sub-second navigation |

---

## ✅ CURRENT FEATURES (Built)

### Core
- [x] Multi-user authentication (JWT + Google OAuth)
- [x] Bank account management (manual + Plaid sync)
- [x] Transaction import (CSV — universal column mapper)
- [x] Transaction management (add, edit, categorize, search, filter)
- [x] Categories (income + expense, custom icons/colors)
- [x] Budgets (monthly, per-category, progress tracking)
- [x] Dashboard (KPIs, charts, spending breakdown donut, cash flow)
- [x] Projects / Assets (P&L tracking for vehicles, property, business)
- [x] Reports page
- [x] Settings (accounts, categories, appearance)
- [x] Theme system (Meridian dark, Linen light)
- [x] Duplicate transaction detection on CSV import
- [x] Responsive web app

### Infrastructure
- [x] NX monorepo (Next.js 16 + NestJS 11)
- [x] PostgreSQL with TypeORM
- [x] GCP Cloud Run + Cloud Build CI/CD (dev)
- [x] Supabase-compatible (cloud DB ready)
- [x] Docker containers for web + API

---

## 🚧 PENDING — CRITICAL (Before Launch)

### Security & Auth
- [ ] **Password reset** — forgot password → email link (blocker for launch)
- [ ] **Email verification** on signup
- [ ] **Rate limiting** on login endpoint (NestJS throttler)
- [ ] Rotate Google OAuth + Plaid secrets (exposed in dev)
- [ ] JWT secret → strong random value in production
- [ ] HTTPS enforcement on Cloud Run

### Infrastructure
- [ ] Supabase connection working (test from non-blocked network)
- [ ] `cofre-prod` GCP project created
- [ ] Cloud SQL or Supabase prod database
- [ ] `cloudbuild.prod.yaml` for main branch deploys
- [ ] Secret Manager for all production credentials
- [ ] Health check endpoint (`GET /api/health`)
- [ ] Graceful shutdown hooks (NestJS)
- [ ] `.env.example` file committed

### Monitoring
- [ ] Sentry (free tier) for error tracking
- [ ] Uptime monitoring (BetterUptime free or UptimeRobot)
- [ ] Basic logging strategy (Cloud Logging)

---

## 🗺️ ROADMAP

---

### Phase 1 — Launch Ready (2–4 weeks)
**Goal: First real user can sign up, use the app, and not get stuck**

| Feature | Priority | Est. |
|---|---|---|
| Password reset (email link) | 🔴 Critical | 1 day |
| Email verification | 🔴 Critical | 1 day |
| Rate limiting (login, register) | 🔴 Critical | 2 hours |
| Transactional email setup (Resend.com) | 🔴 Critical | 2 hours |
| Production deployment (cofre-prod) | 🔴 Critical | 1 day |
| Custom domain | 🟡 High | 1 hour |
| Sentry error monitoring | 🟡 High | 1 hour |
| Landing page (basic) | 🟡 High | 2 days |
| Mobile responsiveness audit | 🟡 High | 1 day |

---

### Phase 2 — Monetization (1–2 months post-launch)
**Goal: First paying customer**

| Feature | Priority | Est. |
|---|---|---|
| Stripe subscription integration | 🔴 Critical | 2 days |
| Pricing page (Free / Pro) | 🔴 Critical | 1 day |
| Free tier limits enforcement | 🟡 High | 1 day |
| Upgrade prompts (contextual) | 🟡 High | 1 day |
| User onboarding checklist | 🟡 High | 1 day |
| ToS + Privacy Policy | 🔴 Critical | Legal |
| Admin dashboard (MRR, user count) | 🟢 Medium | 2 days |

**Recommended Pricing:**

| Plan | Price | Limits |
|---|---|---|
| **Free** | $0 | 1 bank account, 3 months history, no Plaid |
| **Pro** | $7/mo · $59/yr | Unlimited accounts, full history, Plaid, AI insights |
| **Family** | $12/mo · $99/yr | Pro + up to 5 members |

---

### Phase 3 — Retention & Differentiation (2–4 months)
**Goal: Users stay, tell friends, pay**

| Feature | Priority | Notes |
|---|---|---|
| **AI spending insights** | 🔴 Critical | "You spent 40% more on food this month" + suggestions |
| **AI budget coach** | 🔴 Critical | Claude API — conversational financial advice |
| Weekly/monthly email summary | 🟡 High | Budget alerts, spending report |
| Budget exceeded notifications | 🟡 High | Push/email |
| Investment portfolio snapshot | 🟡 High | Manual holdings tracking (Charles Schwab, 401k) |
| Subscription tracker | 🟡 High | Detect recurring charges, flag price increases |
| Net worth timeline | 🟡 High | Track wealth over time |
| Data export (CSV/PDF) | 🟡 High | GDPR compliance |
| PWA / Install prompt | 🟢 Medium | Mobile-like experience |
| Dark/light/custom themes | 🟢 Medium | Already has 2 themes |

---

### Phase 4 — Scale (4–8 months, when you have 50+ paying users)
**Goal: Become the market leader for the target segment**

| Feature | Notes |
|---|---|
| **Multi-currency support** | Critical for Latam expansion |
| **Latam bank integrations** | Belvo API (Mexico, Brazil, Colombia) |
| **Family/team accounts** | Multi-user per account, role permissions |
| **Bill negotiation partner** | Revenue share with negotiation service |
| **Native mobile app** | React Native or Flutter |
| **Open Banking (EU/UK)** | TrueLayer API for European expansion |
| **Tax optimization hints** | Flag deductible expenses |
| **Affiliate/referral program** | k-factor growth |
| **API for power users** | Personal finance automation |

---

## 🤖 AI STRATEGY

**The single biggest differentiator available.** No competitor does AI well.

### What to build:
1. **Insight engine** — Weekly analysis: "Your top 3 spending categories changed this month. Food +40%, Entertainment −20%."
2. **Budget coach** — Conversational: "I want to save $500/month. What should I cut?" → Claude API analyzes their actual data and responds with specific recommendations
3. **Smart categorization** — Auto-categorize transactions using past patterns + ML
4. **Anomaly detection** — "You have a $99 charge from a service you haven't used in 3 months"
5. **Goal projection** — "At your current rate, you'll reach your $10k emergency fund in 8 months"

**Tech:** Claude API (already Anthropic products). Add `@anthropic-ai/sdk` to the API. Cache aggressively.

---

## 💎 UX PRINCIPLES (Based on What Users Hate)

### 1. Zero friction to value
Users quit in the first 5 minutes. Cofre must show value **before** they add a bank account.
- Demo data mode on signup
- Onboarding that shows the dashboard populated before real data exists
- CSV upload as first-run action (no Plaid required)

### 2. Fast above all else
The #1 complaint about Monarch and YNAB: slowness.
- Sub-200ms page transitions
- Optimistic UI updates (show result before API confirms)
- Skeleton screens instead of spinners

### 3. Insight over data
Users don't want raw numbers — they want to know what to **do**.
Every screen should answer: "So what?" and "What should I do about it?"
- Every KPI card shows trend vs last month
- Budget cards show days remaining + projected overspend
- Dashboard AI summary at the top (Phase 3)

---

## 🚀 GO-TO-MARKET STRATEGY

### Phase 1: Soft launch (0–100 users)
- Personal network: friends, family, colleagues
- Reddit: r/personalfinance, r/ynab (post "I built a YNAB alternative")
- Product Hunt launch (timing: Tuesday–Thursday)
- Twitter/X: build in public ("building a budget app, day X")

### Phase 2: Content (100–1,000 users)
- SEO content: "best YNAB alternative 2026", "best budget app after Mint"
- YouTube: short demos, "budgeting tips" content
- TikTok: short form (Cleo proved Gen Z responds to finance content)
- Affiliate: personal finance bloggers (commission on Pro signups)

### Phase 3: Paid acquisition (1,000+ users)
- Google Ads: "YNAB alternative", "Mint replacement"
- Meta retargeting
- Influencer partnerships (personal finance creators)

### The Mint opportunity
Mint had ~3.6M users when it died in January 2024. Millions are still looking for a replacement. Targeting "Mint alternative" keywords is high-intent, high-value traffic that every competitor is fighting for — **and winning this traffic is a direct path to rapid growth.**

---

## ⚠️ TOP 5 RISKS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Plaid dependency** (cost spikes, API changes) | Medium | High | Build excellent CSV import (done), add Belvo for Latam |
| **User retention** — people try, don't form habit | High | High | Onboarding checklist, weekly email, AI nudges |
| **Bank sync reliability** | High | Medium | Set expectations; show sync status; manual fallback |
| **Competition from incumbents** (Monarch adds AI) | Medium | High | Move fast; target underserved segments (Latam, freelancers) |
| **Data privacy / breach** | Low | Critical | Encryption at rest, no storing bank credentials, SOC2 roadmap |

---

## 🛠️ TECH STACK (Current + Recommended)

### Current (keep)
| Layer | Tech |
|---|---|
| Frontend | Next.js 16 · React 19 · Tailwind v4 |
| Backend | NestJS 11 · TypeORM · PostgreSQL |
| Auth | JWT + Passport + Google OAuth |
| Bank sync | Plaid (sandbox → production) |
| Hosting | GCP Cloud Run (serverless) |
| CI/CD | Cloud Build + GitHub |
| Database | Supabase (PostgreSQL, free tier → paid) |
| Monorepo | NX |

### Add (Phase 1–2)
| Need | Tool | Cost |
|---|---|---|
| Transactional email | Resend.com | Free (3k/mo) |
| Error monitoring | Sentry | Free tier |
| AI | Anthropic Claude API | ~$0.01/insight |
| Payments | Stripe | 2.9% + $0.30/txn |
| Analytics | PostHog (self-host) or Plausible | Free / $9/mo |

### Add (Phase 3–4)
| Need | Tool |
|---|---|
| International banking | Belvo (Latam) · TrueLayer (EU) |
| Push notifications | OneSignal (free) |
| Mobile | Expo (React Native) |
| Search | Meilisearch (fast transaction search) |

---

## 📊 FINANCIAL PROJECTIONS (Conservative)

| Month | Users | Paid (10%) | MRR |
|---|---|---|---|
| Launch | 50 | 5 | $35 |
| 3 months | 300 | 40 | $280 |
| 6 months | 1,000 | 150 | $1,050 |
| 12 months | 5,000 | 800 | $5,600 |
| 18 months | 15,000 | 2,500 | $17,500 |
| 24 months | 50,000 | 8,000 | $56,000 |

*Based on 10% free-to-paid conversion (industry avg: 2–5%; personal finance is higher intent)*

---

## 📋 IMMEDIATE NEXT STEPS (This Week)

1. **Rotate Google OAuth + Plaid credentials** (exposed in chat — do this TODAY)
2. **Resolve Supabase connection** (test from non-blocked network)
3. **Add rate limiting** to login/register endpoints (NestJS throttler, 30 min)
4. **Password reset flow** (Resend email + token-based reset link, 1 day)
5. **Deploy to cofre-dev** on Cloud Run (validate Docker pipeline)

---

*Plan authored June 2026 · Based on competitor research + current Cofre codebase state*
*Next review: When Phase 1 is complete*
