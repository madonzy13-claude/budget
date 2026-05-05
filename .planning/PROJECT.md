# Budget — Family Budgeting & Wealth Tracker

## What This Is

Web app that replaces an advanced personal Excel budget with a multi-tenant SaaS for households. Lets families plan and track expenses (per-category limits, dual normal/cushion budgets), manage a "reserve" buffer for irregular costs, monitor multi-asset investments (stocks, crypto, gold, real estate, bonds), and surface a "Tasks" action queue plus insights. Built mobile-first as an installable PWA.

## Core Value

A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.

## Requirements

### Validated

(None yet — ship to validate)

### Active

#### Identity & Tenancy
- [ ] User can register with email/password (Lucia/BetterAuth) and pick UI + voice language at signup
- [ ] User can change UI/voice language anytime in settings
- [ ] User can create a family workspace and invite members; roles: owner, member
- [ ] Each user has a personal budget visible only to them, plus a shared family budget visible to all members
- [ ] Tenant isolation enforced at DB layer (Postgres + tenant_id + RLS)

#### Money & Currencies
- [ ] All monetary fields are `Money(amount, currency)` — never bare numbers
- [ ] Family picks a default (analytics) currency at creation
- [ ] Any input can be in any currency; system auto-converts to default at current FX rate (Frankfurter / ECB)
- [ ] FX rates stored historically; analytics use the rate as of the transaction date

#### Categories & Budgets
- [ ] User defines spending categories (food, car, kids, …) per scope (personal or shared)
- [ ] Each category has a monthly limit ("normal" budget) and a separate "cushion" budget (austerity mode, e.g. job loss)
- [ ] User can assign expenses to a category at creation or via re-categorization

#### Expense Capture
- [ ] User can add an expense via form: amount, currency, date, category, account, note
- [ ] User can add an expense via voice (browser STT or Groq STT, configurable in settings; provider abstraction pluggable for future providers)
- [ ] All capture surfaces support multi-currency entry
- [ ] Capture pipeline designed so a future bank-API integration plugs in without domain rework

#### Reserve System (optional, opt-in)
- [ ] Family can enable Reserve mode and configure which external account holds reserve funds
- [ ] At month end, for each category, system computes (limit − actual). If positive → emits a "Move X to Reserve" Task; if negative → emits "Move X from Reserve to spending account" Task if reserve has balance
- [ ] System tracks reserve balance per category and overall (logical balance — actual cash sits in user's external account; user confirms moves)
- [ ] Reserve insights: balance per category, suggested top-ups, suggested withdrawals

#### Cushion (optional, opt-in)
- [ ] User configures cushion target as N months of cushion-budget totals
- [ ] User declares cushion holdings across one or more accounts/assets (cash in any currency, bonds, gold, etc.)
- [ ] System computes: cushion target value (in default currency) vs current cushion holdings (auto-converted)
- [ ] Tasks emitted when cushion < target (top-up suggested) or cushion > target by margin (excess can be redeployed)

#### Investments
- [ ] User can record investment positions across asset classes: stocks, ETFs, crypto, physical gold, real estate, bonds, other
- [ ] Per asset, user chooses valuation source: manual snapshots OR API price feed
- [ ] API price feed is pluggable — v1 ships price provider for stocks/crypto/gold; real-estate and bonds remain manual
- [ ] System computes investment growth over time in default currency

#### Onboarding Wizard
- [ ] After signup, conversational Q&A wizard (text + voice, in user's language) helps user define starting categories and budget plan
- [ ] LLM provider for wizard is pluggable; v1 ships Claude Haiku and Groq, user picks in settings
- [ ] Wizard output is editable — never auto-locked

#### Tasks (action queue)
- [ ] System surfaces a single "Tasks" inbox with system-generated suggestions:
    - move money to/from reserve
    - category overspent (overspent = actual > limit + reserve coverage)
    - cushion below target
    - cushion well above target
    - missing investment snapshot
- [ ] User can dismiss, snooze, or mark a Task done; dismissed Tasks don't reappear unless underlying state changes

#### Insights & Charts
- [ ] Investment growth (per asset, per class, total) over time in default currency
- [ ] Spending growth (private, shared, total) overall and per category
- [ ] Overspent timeline per category
- [ ] Reserve statistics per category (balance, inflows, outflows over time)
- [ ] Cushion adequacy over time (target vs actual)

#### Anonymous Family Comparison
- [ ] Opt-in anonymous benchmarking: compare own spending per category vs anonymized percentile across all opted-in families with similar profile (region, household size)
- [ ] Anonymization pipeline strips PII before aggregation; consent flow + revocable opt-in
- [ ] Both EU (GDPR) and US (CCPA) compliant data handling

#### Notifications
- [ ] Email notifications (transactional + budget alerts) via SMTP-compatible service
- [ ] Web-push notifications (PWA) for high-priority Tasks
- [ ] User preferences: per-channel, per-event toggles

#### Platform & Ops
- [ ] PWA: installable, manifest + service worker, offline-friendly read of last-loaded data
- [ ] Single Docker Compose stack runs whole system locally (web, api, db, worker)
- [ ] Production deployment via Docker images, Postgres-as-a-service or self-hosted
- [ ] Multi-tenant SaaS — designed for horizontal scale (stateless app tier, Postgres + read replicas later)
- [ ] i18n full from day one; languages at launch: English, Polish, Ukrainian. New languages added without code changes.
- [ ] GDPR + CCPA: data export per user/family, right-to-delete, EU + US-friendly hosting

#### Engineering Discipline
- [ ] TDD: every domain rule has a failing test before code; coverage gate on domain layer
- [ ] DDD: clear bounded contexts (Identity, Tenancy, Budgeting, Reserves, Cushion, Investments, Tasks, Insights, Comparison, Notifications)
- [ ] Each context owns its data model, ubiquitous language, and module boundary
- [ ] Append-only ledger for transactions; versioned audit history for edits (so user can see "what changed when") — pragmatic alternative to full event sourcing

### Out of Scope

- **Native mobile apps (iOS/Android)** — PWA covers v1. Native deferred.
- **Receipt photo OCR** — voice + form covers v1. OCR could come later.
- **Direct bank API integration (Plaid / Open Banking)** — v1 is manual + CSV path; pipeline architected so this slots in later as a new provider.
- **Receipt import via email forwarding** — out of scope.
- **Tax filing / tax reports** — budgeting only, not accounting.
- **Crypto custody / trading** — read-only valuation only.
- **Generic chat-with-your-data LLM** — LLM is scoped to onboarding + structured Task generation, not free-form chat.
- **Full event sourcing** — append-only ledger + audit history is pragmatic equivalent without CQRS overhead.

## Context

- User is replacing an advanced personal Excel budget they've built and used happily for years. Frustrations: hard to share, weak UI, slow to extend with charts/analytics.
- App will be used by user + their family first; then opened up to other families as a SaaS. So multi-tenancy is required from v1, not a retrofit.
- User explicitly cares about long-term maintainability — hence the strict TDD + DDD discipline. Treat this as a non-negotiable engineering principle, not a "nice to have".
- "Reserve" and "Cushion" are user-invented mental models from their Excel; their semantics matter. Implement them precisely, not loosely.
- Comparison feature is sensitive (privacy + jurisdiction) but explicitly v1.

## Constraints

- **Tech stack — runtime**: TypeScript on Bun — Stack pick driven by full-stack TS, fast startup, strong DDD ergonomics.
- **Tech stack — frontend**: Next.js (React) — SSR, large ecosystem, good for SaaS dashboards.
- **Tech stack — backend**: TypeScript service(s) on Bun, hexagonal architecture per bounded context.
- **Tech stack — database**: Postgres + tenant_id + Row-Level-Security. Append-only ledger table for transactions, versioned audit table for edits.
- **Tech stack — auth**: Self-hosted (Lucia or BetterAuth) — keeps users + sessions in own DB; cost predictable; no per-MAU pricing.
- **Tech stack — FX**: Frankfurter (ECB) via pluggable interface.
- **Tech stack — STT**: Pluggable; v1 ships Browser Web Speech API + Groq STT.
- **Tech stack — LLM**: Pluggable; v1 ships Claude Haiku + Groq.
- **Tech stack — investment prices**: Pluggable; v1 ships at least one provider for stocks, crypto, gold.
- **Deployment**: Docker — primary deployment unit. Compose for local dev, Docker images for prod.
- **Compliance**: GDPR (EU) + CCPA (US) — data export, right-to-delete, opt-in for analytics/comparison.
- **i18n**: Full i18n from start. EN + PL + UK at launch.
- **Engineering**: TDD-first; DDD bounded contexts; ports & adapters for every external integration (FX, STT, LLM, prices, email, push).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Postgres + tenant_id + RLS (not schema-per-tenant, not DB-per-tenant) | Simplest scale path, easy backups, RLS is enough for this risk profile | — Pending |
| Append-only ledger + versioned audit history (not full event sourcing) | History/auditability without CQRS overhead — keeps query path simple, still gives "see what changed when" | — Pending |
| Multi-tenant SaaS from v1 (not single-tenant first) | User explicitly wants to onboard other families later; retrofitting tenancy is painful | — Pending |
| `Money(amount, currency)` value object everywhere | Multi-currency from day one; FX errors are the biggest correctness risk in finance apps | — Pending |
| Frankfurter (ECB) as default FX provider | Free, daily ECB rates, no key, abstracted behind provider interface | — Pending |
| Pluggable provider interfaces for STT, LLM, FX, investment prices, email, push | Lets us swap/add providers without touching domain — also makes testing trivial | — Pending |
| Self-hosted auth (Lucia / BetterAuth) over Clerk | Avoid per-MAU pricing on a budgeting SaaS where margins matter; keep user data in own DB | — Pending |
| Conversational Q&A onboarding (text + voice) instead of CSV bank import | User has no Excel to upload; bank API is out of scope for v1; Q&A in user's language is enough to seed categories | — Pending |
| Anonymous comparison built in v1, not deferred | User wants the differentiator from day one; building privacy pipeline retroactively is harder than upfront | — Pending |
| TDD + DDD as non-negotiables, with bounded contexts as the module boundary | Maintainability over time is a stated user goal, not a stretch goal | — Pending |
| Reserve = logical balance tracker, not a custodial account | App suggests transfers; user moves real money in their bank — keeps us out of payments-regulation scope | — Pending |
| LLM scope limited to onboarding + structured Task generation | Bound the LLM surface area: deterministic core, LLM at the edges | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-05 after initialization*
