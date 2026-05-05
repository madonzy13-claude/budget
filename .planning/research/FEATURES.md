# Feature Research

**Domain:** Multi-tenant SaaS family budgeting & wealth-tracker
**Researched:** 2026-05-05
**Confidence:** HIGH (competitive landscape well-documented; reserve/cushion combo is novel — LOW comparables there)

---

## Executive Summary

The 2026 budgeting market splits into 3 archetypes:

1. **Behavioral budgeters** (YNAB, EveryDollar, Goodbudget) — opinionated method, envelope/rollover, manual-friendly, weak on net worth.
2. **Aggregators** (Monarch, Copilot, Empower, Lunch Money) — bank-sync first, net worth + investments, flexible budgeting, family/couples support varies.
3. **Self-hosted** (Firefly III, Actual Budget) — privacy-first, multi-currency stronger, family support weak (single-account share at best).

This product slots as a **fourth archetype: opinionated-method aggregator-shape, family-native, multi-currency-native, manual+voice capture**. The **reserve + cushion + comparison** combo has no direct competitor:

- **Reserve** is a more disciplined version of YNAB rollover (real external account, suggested transfers, not just a counter). No competitor models reserve as a logical balance against an external real account with suggested moves.
- **Cushion** (dual budget normal/austerity + N-month multi-asset adequacy target) does not exist anywhere. EveryDollar/YNAB have generic emergency funds; none model a parallel "austerity" budget.
- **Anonymous family comparison** existed in Mint (shut down 2024) and lives partially in Yodlee/Pluto Money. None pair it with the family-budget data model. Mint's lesson: comparison was a lead-gen surface (ads/referrals), not a paid feature — privacy was thin. Building it as opt-in privacy-pipeline-first is differentiating.

Multi-currency is **rare and shallow**: Lunch Money, Buxfer, Firefly III support it; YNAB, Monarch, Copilot, Empower do not natively (one default currency, manual workarounds). This is a defensible moat for EU/multi-jurisdiction families.

---

## Feature Landscape

### Table Stakes (Users Expect These)

#### Accounts

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multiple accounts (checking, savings, credit, cash, brokerage) | Every competitor has this; users hold money in many places | LOW | Account = name + type + currency + opening balance. Account is a domain entity, not bank-linked in v1. |
| Manual account balance entry | Bank-API is out for v1; users must adjust manually | LOW | Reconciliation flow: "current actual balance was X, set it" — generates adjustment ledger entry. |
| Account types: cash, checking, savings, credit card, loan, investment | Industry standard taxonomy | LOW | Affects sign convention (credit increases liability). |
| Archive account (retain history, hide from active) | Closed accounts shouldn't pollute UI but history must persist | LOW | Soft-delete + archived flag. |

#### Transactions

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Manual expense entry (amount, currency, date, category, account, note) | PROJECT.md core; baseline of any budget app | LOW | Form-based; multi-currency entry is the differentiator (see below). |
| Manual income entry | Symmetric to expense | LOW | Same form, different category type. |
| Transfer between accounts (no category effect) | Moving own money is not a budget event | LOW | Two-leg ledger entry, links the legs. |
| Edit/delete transaction with audit trail | Users mistype; audit history is PROJECT requirement | MEDIUM | Versioned audit table per PROJECT.md decision. |
| Search/filter transactions (date, category, account, text, amount range) | Every competitor; non-negotiable | MEDIUM | Server-side filter + pagination; index on tenant_id + date. |
| Recurring/scheduled transactions (rent, salary, subscriptions) | YNAB, Monarch, Copilot all have this; predictability of irregular costs depends on it | MEDIUM | Generates pending transactions; user confirms or system auto-posts on date. Required for cushion/reserve forecasting. |
| Split transactions (one purchase, multiple categories) | Grocery run with diapers + food + alcohol — common case | MEDIUM | Single transaction, N category lines summing to total. |
| Tags/labels in addition to category | Cross-cutting analytics (vacation, project, kid-name) | LOW | Many-to-many, optional. |
| Notes/attachments on transactions | Receipts, context | LOW | Notes only in v1 (attachments deferred — implies storage cost + OCR temptation). |
| CSV import | "I have an Excel" — bridge from current world | MEDIUM | Manual mapping UI; idempotent (hash-based dedupe). PROJECT.md says "manual + CSV path". |
| CSV export | GDPR data export + user trust | LOW | Required for compliance anyway. |

#### Categorization

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| User-defined categories | PROJECT.md explicit | LOW | CRUD; per-scope (personal/shared). |
| Category groups/hierarchy | Real budgets have "Auto" → fuel, insurance, repairs | MEDIUM | One level of nesting is sufficient — going deeper hurts UX (Monarch lesson). |
| Re-categorize transaction | Mistakes happen; rules change | LOW | Single-field edit; audit-logged. |
| Bulk re-categorize (filter → apply) | Power user need; saves hours | MEDIUM | Multi-select + bulk update with audit row per change. |
| Category archival (don't delete history) | Same reason as account archival | LOW | |

#### Budgets

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Monthly budget per category (limit + actual + remaining) | Universal | LOW | Foundation. |
| Visualize budget vs actual (bar/progress) | Universal | LOW | Charts. |
| Carry leftover or overspend handling | YNAB rollover; Actual rollover; user expectation | MEDIUM | This product's reserve mechanism replaces vanilla rollover — see differentiator. |
| Budget templates (copy last month's plan) | Tedious otherwise | LOW | One-click "duplicate prior month". |
| Period flexibility (some users want bi-weekly, some monthly) | Niche but requested | MEDIUM | v1 = monthly only. Defer flex periods to v2. |

#### Reports & Insights

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Spending by category (pie/bar, current month) | Universal | LOW | |
| Spending trend over time (line) | Universal | LOW | |
| Income vs expense (cash flow) | Universal | LOW | |
| Net worth snapshot + trend | Empower/Monarch baseline | MEDIUM | Sum of accounts (with currency conversion) over time. |
| Monthly summary email/digest | Behavioral nudge; standard | LOW | After notifications wired up. |
| Custom date range | Quarterly review, year-end | LOW | |

#### Sharing & Multi-User (Family)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Invite family member by email | Monarch baseline; YNAB/Copilot weak here | MEDIUM | Token email invite, role assignment. |
| Roles: owner, member | PROJECT.md explicit | LOW | Owner has billing/destructive ops; member has full data access on shared scope. |
| Each member has personal budget + access to shared budget | PROJECT.md explicit; rare in competitors | MEDIUM | Two-scope data model from day one. |
| Per-transaction "who paid" attribution | Monarch shared-views, helpful for couples | MEDIUM | Optional field on transaction; default = current user. |
| See who edited what (audit trail visible to family) | Trust within household | MEDIUM | Falls out of audit table requirement. |

#### Security & Auth

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email/password registration | PROJECT.md (Lucia/BetterAuth) | MEDIUM | Standard. |
| Email verification | Anti-abuse; standard | LOW | |
| Password reset (email) | Standard | LOW | |
| 2FA (TOTP minimum) | Financial data — users expect it | MEDIUM | Push to v1.x only if tight; many competitors lack it (Mint did). |
| Session management (revoke device) | Trust-building | LOW | Lucia/BetterAuth provides primitives. |
| Tenant isolation (Postgres RLS) | PROJECT.md explicit; correctness | HIGH | Every query carries tenant_id; RLS enforces. Test with multi-tenant test suite. |
| Encryption at rest + in transit | Financial data table stakes | LOW | Postgres + TLS — operational, not feature. |
| GDPR data export (per user / per family) | Legal requirement EU | MEDIUM | JSON + CSV bundle of all user-owned data. |
| GDPR right-to-delete | Legal requirement EU | MEDIUM | Tombstone family/user, anonymize ledger entries (don't break aggregates). |
| CCPA opt-out for analytics | Legal requirement US | LOW | Toggle in settings; gates comparison feature. |

#### i18n & Currencies

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| UI in user's language (EN/PL/UK at launch) | PROJECT.md explicit; EU market expectation | MEDIUM | i18n framework from day one; no late retrofit. |
| Localized number/date formatting | i18n table stakes | LOW | Falls out of i18n lib (Intl APIs). |
| Multi-currency input on every Money field | PROJECT.md core; rare in competitors | MEDIUM | Money(amount, currency) value object. |
| FX conversion to family default currency | PROJECT.md core | MEDIUM | Frankfurter (ECB) provider; historical rate at txn date. |
| FX rate history stored | Analytics correctness — convert at-time-of-event | MEDIUM | Daily rate cache table. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Reserve mechanism (logical balance against external account)** | YNAB rollover counts in-app dollars; this product tracks a real external account and emits transfer Tasks. Disciplined, audit-friendly, low regulatory surface (no custody). | HIGH | Per-category and total balance; month-end task generation; user confirms moves. **Novel — no direct competitor.** |
| **Dual budget per category (normal + cushion)** | Single-budget apps assume static income. This models austerity scenarios pre-emptively. Closest analog: Goodbudget's separate envelopes — but not coupled to a single category. | HIGH | Two limit values per category; user toggles "cushion mode" globally; reports show normal vs cushion. **Novel.** |
| **Cushion adequacy across multi-asset holdings** | Emergency funds in Empower are bank-account sums. This product values cushion across cash/bonds/gold in default currency, generates "top-up / redeploy" Tasks. | HIGH | Depends on FX + investment valuation. Asset adequacy = sum(holdings_in_default_currency) / (cushion_target * N_months). |
| **Tasks queue (system-emitted action items)** | Most competitors show "alerts" or "insights". This unifies into a single queue with dismiss/snooze/done. Closest: Copilot's AI summaries (passive, non-actionable). | MEDIUM | Domain-event-driven; deterministic generators per task type. Avoid LLM here — generators must be predictable. |
| **Multi-currency native, every input** | Lunch Money/Buxfer/Firefly III support multi-currency but their family/sharing story is weak. YNAB/Monarch/Copilot/Empower assume single currency. This product combines both. | MEDIUM | Money value object + FX provider abstraction is pre-baked in PROJECT.md. |
| **Family workspace (personal + shared scopes from day one)** | Monarch is closest; treats spouse as second account holder. This product has explicit personal vs shared scopes — privacy from spouse for personal expenses + shared for joint. | MEDIUM | Scope = (workspace_id, scope_kind: personal/shared, owner_user_id?). RLS predicates on scope visibility. |
| **Anonymous family comparison (opt-in percentile vs similar households)** | Mint had this (shut 2024) as an ad-targeting surface; never a paid feature. This product makes it user-facing benefit, privacy-pipeline first. Yodlee/Pluto Money do this for banks not consumers. | HIGH | Cohort = (region, household_size, currency); compute percentiles on aggregated anonymized data. **Privacy pipeline must be designed before any data flows.** |
| **Conversational onboarding (text + voice, in user's language)** | YNAB onboarding is a tutorial; Monarch is a setup wizard. This product asks "what do you spend on?" in voice and builds the plan. EU/PL/UK localization included. | HIGH | LLM (Claude Haiku/Groq) bounded to structured output: list of categories + initial limits. Editable. Voice via browser STT or Groq STT (PROJECT.md). |
| **Investment tracking with pluggable price source per asset** | Empower/Monarch use Plaid investment sync (US-centric). Kubera supports more asset types but is single-user, US-pricing focus. This product allows manual snapshot OR API per-asset — including physical gold, real estate (manual), bonds. | HIGH | Provider interface per asset class. v1 ships stocks (e.g. Yahoo/Alpha Vantage), crypto (CoinGecko), gold (manual or metals API). |
| **Pluggable provider architecture (FX, STT, LLM, prices, email, push)** | Operational moat: swap providers without domain code change; user-selectable per-feature provider. | MEDIUM | Hexagonal/ports-and-adapters per PROJECT.md. Falls out of DDD discipline. |
| **PWA-first installable, offline-friendly read** | Native mobile out of v1; PWA closes gap. Lunch Money is PWA-only and works. | MEDIUM | Service worker caches last-loaded data; writes go online. |
| **Append-only ledger + visible audit history** | "What changed when" is a recurring family-budget pain (one spouse changes the plan, the other doesn't see). YNAB has this poorly. | MEDIUM | Per PROJECT.md decision; falls out of architecture. Render in UI = differentiator. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Direct bank API integration (Plaid / Open Banking)** | "Mint had this; YNAB does this; users hate manual entry" | Plaid is US-only, expensive (per-MAU), broken often (5-10% sync failures industry-wide). EU PSD2 is fragmented per country. Coverage for PL/UK is weak. Out for v1 per PROJECT.md. | Architect capture pipeline as provider interface so future Plaid/GoCardless/Tink slots in. CSV import + voice covers the gap initially. |
| **Receipt photo OCR** | "Faster expense entry" | OCR accuracy is 70-90%; users still verify; engineering cost is significant; most receipts are still better-typed. | Voice entry covers fast capture (PROJECT.md). |
| **Native iOS/Android apps** | App store presence; some platform features | 2x engineering surface; PWA closes 95% of gap; native deferred per PROJECT.md. | Installable PWA with manifest + service worker. |
| **Tax filing / tax reports** | "I track money, taxes are about money" | Tax is jurisdictional regulation, not budgeting. CPA territory. Every country differs. Out per PROJECT.md. | Provide CSV export; user feeds their tax software. |
| **Crypto custody / trading** | "Track crypto, why not trade?" | Custody = MSB/MTL licensing in US, MiCA in EU. Out per PROJECT.md. | Read-only valuation only. |
| **Generic chat-with-your-data LLM** | "AI is hot; ask my budget anything" | Hallucinations on financial data are catastrophic; Monarch's AI Assistant is bounded summary-only for a reason. Out per PROJECT.md. | LLM scoped to onboarding + structured Task generation. Deterministic core. |
| **Auto-categorization via AI (rule-based or ML)** | Copilot's selling point; "saves time" | False positives erode trust on financial data; user must still review. Adds significant complexity. | Rule-based string match (user-defined "if merchant contains X → category Y") in v1.x. ML-categorization deferred. |
| **Real-time everything (live updates between family members)** | "Slack-like collaboration" | WebSockets infra, sync conflicts, partial-state edge cases. Polling on page load is fine for budget data. | Eventual consistency; refresh on focus. Push notifications for high-priority Tasks only. |
| **Calendar bill-pay reminders / autopay execution** | "I want one app for everything" | Autopay = payments processing, regulated. | Recurring transactions + Task notifications cover reminder use case; user pays in their bank. |
| **Goal feature beyond cushion** ("save for vacation") | Universal in competitors | Adds another mental model alongside reserve and cushion → user confusion (3 buckets to reason about). Reserve already covers irregular planned expenses. | Reserve category for "vacation" achieves the same with one mental model. |
| **Receipt email forwarding** | "Forward receipts to budget@..." | Spam vector; OCR dependency; deliverability nightmare. Out per PROJECT.md. | Voice or form. |
| **Investment trade execution** | "I track investments, why not buy?" | Brokerage = SEC/FINRA/MiFID licensing. Out. | Read-only. |

---

## Feature Dependencies

```
i18n framework (EN/PL/UK)
    └── Conversational onboarding (in user's language)
    └── All UI labels

Money value object + FX provider
    ├── Multi-currency transaction entry
    ├── Default-currency reports/charts
    ├── Net worth (cross-currency)
    ├── Cushion adequacy (multi-asset, multi-currency)
    └── Investment growth charts

Tenancy + RLS + roles
    ├── Personal vs shared scope
    ├── Family invite/membership
    ├── Audit history visible to family
    └── Comparison (cohort = anonymized tenants)

Categories + budgets
    ├── Reserve mechanism (depends on category limit + actual)
    │       └── Reserve Tasks (move to/from)
    ├── Cushion (dual budget per category)
    │       ├── Cushion target = sum(cushion_limits) * N
    │       └── Cushion adequacy = target vs holdings
    │               └── depends on Investment valuation
    └── Spending insights/charts

Append-only ledger + audit
    ├── Edit transaction (versioned)
    ├── "What changed" UI
    └── Reconciliation reliability

Investment positions
    ├── Price provider per asset (pluggable)
    │       ├── Stocks/ETFs provider (e.g. Yahoo/AlphaVantage)
    │       ├── Crypto provider (e.g. CoinGecko)
    │       ├── Gold provider (metals API)
    │       └── Real estate/bonds = manual snapshots
    ├── Investment growth chart (per asset, per class, total)
    └── Cushion holdings (when cushion enabled)

Tasks queue
    ├── Reserve generators (need reserve mechanism)
    ├── Cushion generators (need cushion + investments)
    ├── Overspend generators (need budgets)
    ├── Missing-snapshot generators (need investments)
    └── Notifications (email + web push)

Comparison
    ├── Anonymization pipeline (PII strip, cohort assignment)
    ├── Opt-in consent (CCPA/GDPR)
    ├── Aggregation worker (compute percentiles)
    └── Cohort = (region, household_size, default_currency)

LLM provider abstraction
    ├── Conversational onboarding
    └── (Bounded scope — no chat-with-data)

Notifications (email + web push)
    ├── PWA service worker (push)
    ├── SMTP provider (email)
    └── Per-channel/per-event preferences
```

### Dependency Notes

- **Reserve depends on monthly budget close**: end-of-month job computes (limit − actual) per category, emits Tasks. Implies a job/worker tier and a "close month" event.
- **Cushion depends on investments + FX**: cushion holdings can be cash (bank account) OR bonds/gold/etc — must value all in default currency. Investment provider + FX provider both required before cushion is meaningful.
- **Comparison depends on enough opted-in tenants**: until N tenants exist in a cohort, percentiles are noise. v1 must gate display until a min cohort threshold (e.g. 10) is hit; until then show "not enough data" — privacy + statistical honesty.
- **Tasks queue depends on every other domain**: it's the integration surface. Build last per phase, but design the Task event interface early so generators can emit during their feature build.
- **Conversational onboarding requires i18n + LLM provider**: ship i18n framework before wizard, since wizard outputs into category labels.
- **Audit history depends on append-only ledger**: ledger is the substrate; audit is the read-side projection.
- **RLS + tenant_id depends on every persisted entity**: must be in the schema baseline. Retrofitting tenancy is the single highest-risk anti-pattern.

---

## MVP Definition

### Launch With (v1)

Strictly minimum to validate the family-first multi-currency reserve+cushion thesis.

**Identity & Tenancy**
- [ ] Email/password registration with language pick at signup
- [ ] Family workspace creation; invite by email; roles (owner/member)
- [ ] Personal vs shared scope visibility
- [ ] Tenant isolation via Postgres RLS

**Money & Currencies**
- [ ] Money value object enforced everywhere
- [ ] Multi-currency input on every monetary field
- [ ] Frankfurter FX provider; rate-as-of-date for analytics
- [ ] Default analytics currency per family

**Accounts & Transactions**
- [ ] CRUD account (cash, checking, savings, credit, loan, investment)
- [ ] Manual expense + income + transfer entry
- [ ] Edit/delete with audit history
- [ ] Search/filter
- [ ] Recurring/scheduled transactions (required for cushion forecasting)
- [ ] CSV import + export

**Categories & Budgets**
- [ ] User-defined categories per scope
- [ ] One-level groups (optional)
- [ ] Monthly normal limit + cushion limit per category
- [ ] Budget vs actual visualization

**Reserve**
- [ ] Configure reserve external account
- [ ] Month-end (limit − actual) computation per category
- [ ] Reserve balance tracking per category + total
- [ ] Tasks: "Move X to/from Reserve"; user confirms

**Cushion**
- [ ] Configure cushion target (N months)
- [ ] Declare cushion holdings (multi-account, multi-asset)
- [ ] Compute adequacy in default currency
- [ ] Tasks: "Top up cushion" / "Excess cushion"

**Investments**
- [ ] CRUD investment positions across asset classes
- [ ] Per-asset valuation source: manual snapshot OR API
- [ ] v1 ships providers: stocks (1 provider), crypto (CoinGecko), gold (1 metals provider)
- [ ] Real estate + bonds = manual only
- [ ] Growth chart in default currency

**Onboarding Wizard**
- [ ] Conversational text+voice Q&A in user's language
- [ ] Outputs editable initial categories + limits
- [ ] LLM provider pluggable (Claude Haiku, Groq)

**Tasks Queue**
- [ ] Unified inbox, generators for: reserve moves, overspend, cushion top-up, cushion excess, missing snapshot
- [ ] Dismiss / snooze / mark done
- [ ] Re-emission only on state change

**Insights**
- [ ] Net worth + trend
- [ ] Spending by category + trend (personal/shared/total)
- [ ] Investment growth (per asset/class/total)
- [ ] Reserve stats per category
- [ ] Cushion adequacy over time

**Comparison**
- [ ] Opt-in consent flow (CCPA/GDPR-aware)
- [ ] Anonymization pipeline (cohort = region, household size, default currency)
- [ ] Percentile display per category — gated on min cohort size
- [ ] Revocable opt-in

**Notifications**
- [ ] SMTP email (transactional + budget alerts)
- [ ] Web-push for high-priority Tasks
- [ ] Per-channel/per-event preferences

**Platform & Compliance**
- [ ] PWA installable, manifest + service worker, offline read of last data
- [ ] i18n EN + PL + UK
- [ ] GDPR export (JSON+CSV per user/family)
- [ ] GDPR delete (tombstone + anonymize)
- [ ] Docker Compose dev stack; Docker prod images

### Add After Validation (v1.x)

- [ ] **2FA (TOTP)** — trust-building; punt only if it slows v1 ship.
- [ ] **Bulk re-categorize** — power-user need; needs N existing users.
- [ ] **Rule-based auto-categorization** ("if merchant contains X → category Y") — manual rules, not ML.
- [ ] **Tags/labels** — additive over categories; not blocking.
- [ ] **Per-transaction "who paid" attribution** — Monarch's shared-views pattern; add when 2+ family households exist.
- [ ] **Monthly summary email digest** — behavioral nudge; needs notifications wired up first.
- [ ] **Additional price providers** (Alpha Vantage fallback, Plaid investments) — operational maturity.
- [ ] **Bond yield / coupon tracking** — graduate from "manual" to "structured manual + computed accrual".

### Future Consideration (v2+)

- [ ] **Bank API integration (Plaid US, GoCardless EU, Tink, Open Banking PL/UK)** — pluggable provider exists; flip on once user demand validated and licensing scoped.
- [ ] **Native mobile (iOS/Android)** — only if PWA's iOS push limits become real friction.
- [ ] **Receipt OCR** — only if voice entry doesn't cover fast capture.
- [ ] **ML auto-categorization** — defer until rule-based + manual data proves the labels.
- [ ] **Bi-weekly / custom budget periods** — niche.
- [ ] **Family allowance / kids accounts** — household-internal sub-tenants.
- [ ] **Investment scenario / projection modeler** — Empower territory; defer.
- [ ] **Webhooks / API for power users** — once usage patterns clear.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tenant isolation (RLS) | HIGH | HIGH | P1 |
| Money value object + FX | HIGH | MEDIUM | P1 |
| Account + transaction CRUD | HIGH | LOW | P1 |
| Edit + audit history | HIGH | MEDIUM | P1 |
| Recurring transactions | HIGH | MEDIUM | P1 |
| Categories + monthly budget + cushion budget | HIGH | MEDIUM | P1 |
| Reserve mechanism | HIGH | HIGH | P1 |
| Cushion adequacy | HIGH | HIGH | P1 |
| Investment positions + 1 provider per class | HIGH | HIGH | P1 |
| Tasks queue + generators | HIGH | MEDIUM | P1 |
| Family workspace + invites + roles | HIGH | MEDIUM | P1 |
| Conversational onboarding | HIGH | HIGH | P1 |
| Net worth + spending charts | HIGH | LOW | P1 |
| Anonymous comparison | MEDIUM | HIGH | P1 (founder-flagged differentiator) |
| Email + web-push notifications | MEDIUM | MEDIUM | P1 |
| PWA installable | MEDIUM | LOW | P1 |
| i18n EN/PL/UK | HIGH | MEDIUM | P1 |
| GDPR export + delete | HIGH (legal) | MEDIUM | P1 |
| CSV import | MEDIUM | MEDIUM | P1 |
| 2FA | MEDIUM | MEDIUM | P2 |
| Bulk re-categorize | MEDIUM | MEDIUM | P2 |
| Rule-based auto-categorization | MEDIUM | MEDIUM | P2 |
| Per-transaction "who paid" | MEDIUM | LOW | P2 |
| Tags | LOW | LOW | P2 |
| Bank API integration | HIGH | HIGH | P3 |
| Native mobile | MEDIUM | HIGH | P3 |
| Receipt OCR | LOW | HIGH | P3 |
| ML auto-categorization | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | YNAB | Monarch | Copilot | Empower | Lunch Money | Actual | Firefly III | This Product |
|---------|------|---------|---------|---------|-------------|--------|-------------|--------------|
| **Multi-currency native** | No (workarounds) | No | No | No | Yes (160+) | Limited | Yes | **Yes — every Money input** |
| **Family / shared budget** | Weak (one login, shared) | Strong (shared views, who-paid) | Limited | Single-user mostly | Limited | Local share via sync | Local share | **Strong — personal + shared scopes, roles** |
| **Envelope / rollover** | Yes (zero-based, monthly rollover) | No (flexible) | No | No | Recent (2025-26 redesign) | Yes (rollover) | Yes (categories) | **Yes — but as Reserve to external account, not in-app counter** |
| **Sinking funds for irregular costs** | Yes (targets feature) | Yes (goals) | Manual | Manual | Yes (recurring + buffer) | Yes (rollover) | Yes | **Yes — Reserve covers this; one mental model not two** |
| **Cushion / austerity dual budget** | No | No | No | No | No | No | No | **Novel** |
| **Anonymous peer comparison** | No | No | "AI summary" only (passive) | No | No | No | No | **Yes — opt-in privacy-pipeline first** |
| **Investment tracking** | Manual only | Yes (sync, no real estate beyond Zillow) | Yes (sync) | Strong (sync, allocation) | Limited | Manual | Manual | **Yes — pluggable per asset; gold/RE/bonds supported** |
| **Bank API sync** | Yes (US/CA) | Yes (Plaid) | Yes (Plaid) | Yes | Yes | No | Manual + import | **No (v1) — pluggable later** |
| **Voice input** | No | Limited (AI summary) | No | No | No | No | No | **Yes — capture + onboarding** |
| **Conversational onboarding** | No (tutorial) | Setup wizard | Manual | Manual | Manual | Manual | Manual | **Yes — text + voice in user language** |
| **Self-hosted option** | No | No | No | No | No | Yes | Yes | No (SaaS) — but Docker Compose for dev |
| **EU language coverage** | EN only | EN only | EN only | EN only | EN only | Community | Yes (many) | **EN + PL + UK at launch** |
| **GDPR-native** | Partial | Partial | Partial | Partial | Partial | Self-hosted = N/A | Self-hosted = N/A | **Yes — built-in export/delete from day one** |
| **Tasks/action queue** | "Targets" goals (passive) | AI weekly summary (passive) | AI summary (passive) | Alerts | No | No | Reminders | **Active queue with dismiss/snooze/done** |
| **Append-only ledger / audit history** | Limited | Limited | Limited | No | Limited | Local file history | Audit log | **Yes — visible to family** |

**Where this product is novel (no competitor has it):**
- Reserve as logical balance against external real account with suggested-transfer Tasks
- Dual normal/cushion budget per category
- Cushion adequacy across multi-asset holdings
- Family-native + multi-currency-native combined
- Conversational voice onboarding in EN/PL/UK
- Active Task queue (not passive alerts/summaries)

**Where this product is derivative (intentionally — table stakes):**
- Account/transaction CRUD, categories, monthly budgets, charts, CSV
- Multi-currency engine (Lunch Money/Firefly do it well — match them)
- Family sharing (Monarch is the bar — match it)
- Investment tracking (Empower/Kubera are the bars — partial match in v1)

---

## Sources

- [Era vs. Monarch vs. Copilot vs. YNAB: 2026 comparison](https://era.app/articles/era-vs-monarch-vs-copilot-vs-ynab/)
- [WalletHub: YNAB vs Monarch vs Copilot 2026](https://wallethub.com/edu/b/ynab-vs-monarch-vs-copilot-vs-wallethub/150687)
- [Engadget: Best budgeting apps 2026](https://www.engadget.com/apps/best-budgeting-apps-120036303.html)
- [Monarch for Couples and Households](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households)
- [Monarch Shared Views](https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch)
- [Lunch Money Multi-Currency](https://lunchmoney.app/features/multicurrency/)
- [Buxfer Multiple Currencies](https://www.buxfer.com/features/multiple-currencies/secure-money-dashboard)
- [Firefly III GitHub](https://github.com/firefly-iii/firefly-iii)
- [Actual Budget multi-user docs](https://actualbudget.org/docs/config/multi-user/)
- [Actual Budget joint accounts](https://actualbudget.org/docs/budgeting/joint-accounts/)
- [Actual Budget 2026 roadmap](https://actualbudget.org/blog/roadmap-for-2026/)
- [YNAB monthly rollovers](https://www.ynab.com/blog/master-your-monthly-rollovers)
- [YNAB sinking funds](https://www.ynab.com/blog/what-is-a-sinking-fund)
- [YNAB overspending guide](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi)
- [Empower review 2026](https://choosefi.com/review/empower-review-the-ultimate-net-worth-tracker)
- [Rob Berger: Empower review](https://robberger.com/empower-review/)
- [Mint shutdown alternatives — Rocket Money](https://www.rocketmoney.com/learn/personal-finance/mint-app-shutting-down)
- [Yodlee Peer Benchmarking](https://developer.envestnet.com/products/yodlee/peer-benchmarking)
- [Net Worth Neighbor (anonymous comparison)](https://www.networthneighbor.com)
- [Pluto Money on peer comparison](https://medium.com/pluto-money/the-power-of-comparing-your-finances-de28d6ce7aa1)
- [Kubera asset coverage](https://robberger.com/investment-tracking-apps/)
- [GDPR Advisor: budgeting apps compliance](https://www.gdpr-advisor.com/ensuring-gdpr-compliance-in-personal-finance-and-budgeting-apps/)
- [Sprinto: CCPA vs GDPR](https://sprinto.com/blog/ccpa-vs-gdpr/)
- [EveryDollar sinking funds](https://www.ramseysolutions.com/money/everydollar)
- [Goodbudget envelope](https://goodbudget.com/)

---

*Feature research for: multi-tenant SaaS family budgeting & wealth-tracker*
*Researched: 2026-05-05*
