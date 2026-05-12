# Phase 3: Navigation, Home & BDP Frame - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the v1.0 sidebar + per-workspace pages chrome with the v1.1 top-nav budget switcher + combined home (`/`) + Budget Detail Page (BDP) tab shell. Phase 3 ships the structural UI scaffold — routes, dropdown, home cards, sticky-pill tabs, task-banner shell — that every subsequent tab phase plugs into.

Concretely:

- **Top nav** — Brand mark / app name (left) + budget switcher (current budget name + private/shared icon + chevron) with `+ New budget` icon-button **aside** the trigger (NAV-03) + user menu (right). Dropdown groups Personal / Shared, native checkmark on active row, no search input. Same Popover pattern on desktop and mobile.
- **Home `/`** — Responsive 1/2/3-col grid of `BudgetCard`s. Each card: header (name + private/shared icon + type badge) → stat row (current-month spent, total wallets value in `display_currency`) → top-1–2-overspent strip. Whole-card click → `/budgets/[id]/spendings`. Below the grid: placeholder chart slot (CSS box, no chart lib). **Provisional layout** — user will hand a custom tile list later (see Deferred).
- **BDP `/budgets/[id]`** — Shared layout (`/budgets/[id]/layout.tsx`) renders task-banner shell + sticky pill tabs above each tab's own `page.tsx`. Tabs are full Next.js routes (`/spendings`, `/reserves`, `/wallets`, `/settings`), so browser back/forward respects them (BDP-05). Default = Spendings; redirect `/budgets/[id]` → `/budgets/[id]/spendings`. Phases 4–6 fill in real content; this phase ships placeholder pages.
- **Task banner shell (BDP-03)** — Above pills. RSC initial render of pending-task count from `GET /budgets/[id]/tasks?status=pending`; client wrapper polls every 60s (paused on hidden tab). Banner hidden when count = 0. Click → inline accordion expands list. Each task row: title + kind chip + disabled action button placeholder. Phase 7 fills i18n keys and wires actions; this phase ships shell + count + expand UI.
- **Routing cleanup** — `apps/web/src/app/[locale]/(app)/workspaces/*` page tree deleted. Wizard route `/budgets/new` lives under the same `(app)` group sharing the top-nav layout. User-level `/settings` page (locale, sessions) stays separate from per-budget `/budgets/[id]/settings`.

**Out of phase:**

- Real Spendings grid (Phase 4), Reserves+Wallets editable tables (Phase 5), Settings sections + onboarding wizard _content_ (Phase 6), task-row primary actions + i18n catalog for task kinds (Phase 7), real chart wiring (Phase 8+).
- SSE/real-time task push, PWA-offline banner cache, web-push (all Phase 8 territory).

</domain>

<decisions>
## Implementation Decisions

### BDP tab frame

- **D-PH3-01:** Pill tabs are **always sticky** directly under the top-nav (`position: sticky; top: 64px`). Task banner stacks above and sticks with them — single sticky container so the BDP scrolls cleanly. No scroll-aware shrink/hide logic.
- **D-PH3-02:** Active pill uses the **filled** treatment: `{colors.primary}` background + `{colors.on-primary}` (black) text — direct application of DESIGN.md `button-primary` styling at pill scale. Inactive pills: transparent background, `{colors.on-dark}` text, 1px hairline on hover. Matches BDP-04 and DESIGN.md "Don'ts" (yellow reserved for primary moments — active tab qualifies).
- **D-PH3-03:** Mobile (≤ 480px) **icon+label collapse** — active pill keeps its label, inactive pills render icon-only with `aria-label` + native tooltip on long-press. Icons: lucide `LayoutGrid` (Spendings), `Coins` (Reserves), `Wallet` (Wallets), `Settings`. Above 480px all four labels render. (Lucide already in dependency set.)
- **D-PH3-04:** Tabs are **separate Next.js routes** per BDP-05. Directory shape:
  ```
  app/[locale]/(app)/budgets/[id]/
    layout.tsx        // top-nav reuse + task banner + pills
    page.tsx          // redirect → ./spendings
    spendings/page.tsx  // placeholder, Phase 4
    reserves/page.tsx   // placeholder, Phase 5
    wallets/page.tsx    // placeholder, Phase 5
    settings/page.tsx   // placeholder, Phase 6
  ```
  Pills use `<Link>` for client-side navigation; RSC re-renders the active tab's `page.tsx` only. Browser back/forward and deep-link copy both work.

### Budget switcher dropdown

- **D-PH3-05:** **Plain Popover with grouped lists** — no search input. Two labeled sections `Personal` / `Shared`. Most households have < 10 budgets; `command.tsx` (cmdk) is overkill and adds top-nav weight. Falls back gracefully if list grows: vertical scroll inside the popover. (Revisit if real-world budgets/user > 15.)
- **D-PH3-06:** Active-budget row gets a **leading `Check` icon** (lucide). Matches Radix dropdown-menu native a11y convention (`role=menuitemradio` + `aria-checked`). Yellow recolor / left-bar variants rejected per DESIGN.md "yellow reserved for primary actions" rule.
- **D-PH3-07:** `+ New budget` is a **separate round icon-button to the right of the switcher trigger**, on the nav bar itself — not inside the dropdown panel. Satisfies NAV-03 ("aside ... not as a list item") literally. Uses existing `Button size="icon"` primitive.
- **D-PH3-08:** Same Popover pattern across breakpoints — **no separate mobile Sheet**. Radix Popover handles small viewports natively (viewport-width with margin). Existing `workspace-switcher.tsx` Sheet pattern is deprecated and deleted as part of this phase.

### Home cards & data shape

- **D-PH3-09:** Responsive grid: **1 col < 640px, 2 cols 640–1023px, 3 cols ≥ 1024px**. CSS Grid with `auto-fill minmax`. Cards never grow taller than content; orphan rows acceptable (≥ 4 budgets in 3-col view yields a single row of 3 + 1).
- **D-PH3-10:** **Sectioned card** layout (provisional — see Deferred): header (budget name + private/shared icon + `PRIVATE`/`SHARED` type badge) → stat row (current-month spent + total wallets value in user's `display_currency`) → top-1–2-overspent strip (`Groceries −45 €`, max 2 lines). Whole-card click navigates to `/budgets/[id]/spendings`.
- **D-PH3-11:** **RSC parallel-Suspense per card.** Each `<BudgetCard>` is an async Server Component that fetches its own summary endpoint. Suspense boundary per card → cards stream in as data arrives; one slow budget doesn't block siblings. Backend: thin new route `GET /budgets/[id]/home-summary` returns `{ name, kind, spent_current_month, wallets_value_display_ccy, top_overspent: [{category, over_amount}, ...] }`.
- **D-PH3-12:** **FX conversion server-side** in the `home-summary` endpoint. Backend pulls FX rates (Phase 2 fxProvider port, latest daily snapshot) and emits the wallets sum already converted into the user's `display_currency`. Keeps `Money` math behind the adapter boundary per CLAUDE.md hexagonal rules. `display_currency` source: `users.display_currency` (Better Auth users table; default = budget's `default_currency` if null).

### Task banner shell

- **D-PH3-13:** **RSC initial render + 60s client poll** for pending-task count. Initial paint shows real count (no CLS). Client wrapper uses React Query (`useQuery` with `refetchInterval: 60_000`) and pauses on `document.visibilityState === 'hidden'`. SSE rejected for v1.1 (Phase 7 generators run on pg-boss cron — most tasks arrive on a schedule that doesn't need sub-minute freshness; SSE adds Hono SSE handler + LISTEN/NOTIFY + PWA fallback to Phase 3 scope). Swap is contained to a single hook if real-time becomes a felt pain post-launch.
- **D-PH3-14:** Empty state = **banner hidden entirely** when count = 0. Matches BDP-03 ("when tasks exist") and v1.1-SPEC §2 wording. Reduces visual clutter on the calm path.
- **D-PH3-15:** Expand interaction = **inline accordion under banner**. Click banner bar (or count chip) → height animates open, task rows render in-flow above the pill tabs. Keeps BDP-tab context. Overlay drawer / dedicated `/tasks` route rejected per BDP-03 ("expands inline list").
- **D-PH3-16:** Task row contents = **title + kind chip + disabled action button placeholder**. Title binds to `t('tasks.title.${kind}')` — i18n key namespace ships in Phase 7. Kind chip is a `Badge` with `t('tasks.kind.${kind}')`. Action button is rendered but `disabled` with `aria-disabled="true"` and tooltip `Coming in Phase 7`. Layout matches Phase 7's final shape so no reflow when actions are wired.

### Routing & legacy cleanup

- **D-PH3-17:** Hard delete `apps/web/src/app/[locale]/(app)/workspaces/` page tree and `apps/web/src/components/workspace/workspace-sidebar.tsx`. Existing `workspace-switcher.tsx` rewritten in place under `components/budgeting/budget-switcher.tsx` (rename + redesign — uses Popover not Sheet). No 301 redirects: `/workspaces/*` returns 404 (Next.js default for missing route), aligned with Phase 1 D-09's "no aliases" stance.
- **D-PH3-18:** `/budgets/new` (onboarding wizard route) lives under `app/[locale]/(app)/budgets/new/page.tsx` — shares the top-nav layout. Phase 3 ships a **placeholder page** (`<h1>Create budget</h1>` + back link). Phase 6 fills in the multi-step wizard.
- **D-PH3-19:** User-level `/settings` page (locale, sessions, theme) **stays** as a separate route from per-budget `/budgets/[id]/settings`. No nav-link to it from the top nav in this phase — reachable from user-menu dropdown only.

### Engineering discipline

- **D-PH3-20:** TDD-first per CLAUDE.md. Every BDP layout + page gets at least one Vitest+RTL component test; every backend `home-summary` route gets a `bun:test` integration test against real Postgres in `apps/api/test/routes/`. Playwright BDD (.feature) covers: open `/`, click card → BDP, switch tabs (back/forward), open switcher → swap budget, expand task banner.
- **D-PH3-21:** Dependency-cruiser rules unchanged from Phase 1+2 — domain in `packages/*` cannot import Hono / drizzle / adapters / React. `home-summary` route lives in `apps/api/src/routes/budgets.ts` (or sibling file); application service in `packages/budgeting/src/application/`; new `BudgetHomeSummaryRepo` port if needed.
- **D-PH3-22:** i18n keys for Phase 3: new namespaces `nav.*`, `home.*`, `bdp.*`. Tasks namespace (`tasks.title.*`, `tasks.kind.*`) defined in Phase 7 — Phase 3 ships placeholders that read keys gracefully when absent (fallback to English key).

### Claude's Discretion

- Exact placeholder-chart shape — recommend a CSS box with `min-height: 240px`, 1px hairline border, centered i18n string `home.chart.placeholder` ("Insights coming soon"). No chart lib added to `apps/web/package.json` in Phase 3.
- Whole-card click affordance — recommend `<Link>` wrapping the card with hover state (1px yellow hairline + slight scale on `:hover`). Explicit CTA button inside card not needed.
- Empty home state (zero budgets) — recommend a hero "Create your first budget" block linking to `/budgets/new`, replacing the cards grid entirely.
- Private/shared icon glyph — recommend lucide `Lock` for Private, `Users` for Shared.
- Currency badge inside switcher dropdown row — recommend a small monospace `Badge` with the 3-letter code (`USD`, `PLN`, `UAH`).
- Mobile icon-only pill tap target — minimum 44×44 px touch area per CLAUDE.md responsive rule, even if visual icon is 20×20.
- React Query is the chosen client-fetch lib for the polling wrapper. If not already in `apps/web/package.json`, add it in plan-phase (Phase 4 grid will need it too).
- Where the new `BudgetHomeSummaryRepo` port lives vs reusing existing `WalletRepo` / `TransactionRepo` aggregations — researcher / planner decide based on existing query primitives.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 3 — phase scope, success criteria 1–5, depends-on Phase 2
- `.planning/REQUIREMENTS.md` §NAV (NAV-01..05), §HOME (HOME-01..04), §BDP (BDP-01..05) — 14 v1.1 REQ-IDs locked to Phase 3
- `.planning/v1.1-SPEC.md` §2 (Information architecture — top nav + routes + BDP tabs), §10 (Home page), §11 (Onboarding wizard — Phase 6 scope but route placeholder is Phase 3), §15 (Out of scope: investments, insights, voice STT, LLM onboarding, comparison, email)
- `.planning/PROJECT.md` — milestone goal, carried-forward v1.0 capabilities

### Project conventions

- `CLAUDE.md` — TDD-first, hexagonal layering, `Money` value object boundary, test matrix (Vitest + RTL component / bun:test integration / Playwright BDD E2E), dependency-cruiser invariants, i18n EN/PL/UK, no chart-lib default
- `DESIGN.md` §Top Navigation (`top-nav-dark` 64px), §Buttons (`button-primary` yellow + black), §Cards & Containers (`trust-badge`, `stat-callout-card`, `markets-table-card`), §Components (sticky pill tabs visible in component table), §Do's and Don'ts (yellow scarcity rule)

### Phase 1 & 2 carry-forward (locked decisions still in force)

- `.planning/phases/01-schema-migration-rename-foundation/01-CONTEXT.md` §D-09 (no `/workspaces` aliases — Phase 3 inherits) §D-08 (api-client URL constants already point at `/budgets`)
- `.planning/phases/02-domain-api-restructure/02-CONTEXT.md` §D-PH2-05 (share-link backend routes already in place — used by Phase 6, not Phase 3), §D-PH2-08 (unified transactions resource — Phase 4 consumer, listed here so Phase 3 backend additions stay consistent)

### Existing UI assets (to reuse / replace)

- `apps/web/src/components/ui/dropdown-menu.tsx`, `popover.tsx`, `tabs.tsx`, `card.tsx`, `badge.tsx`, `button.tsx`, `command.tsx` — primitives; tabs primitive needs pill-style variant added
- `apps/web/src/components/common/brand-mark.tsx`, `common/locale-select.tsx` — top-nav left-cluster and user-menu pieces stay
- `apps/web/src/components/workspace/workspace-switcher.tsx` — Sheet-based v1.0 switcher; **rewrite + relocate** as `components/budgeting/budget-switcher.tsx` (Popover-based)
- `apps/web/src/components/workspace/workspace-sidebar.tsx` — **delete** in this phase

### Existing routes (to delete / restructure)

- `apps/web/src/app/[locale]/(app)/workspaces/` — page tree **deleted**; no redirects (404 acceptable per D-09)
- `apps/web/src/app/[locale]/(app)/layout.tsx` — existing `(app)` group layout; **rewrite** to host top-nav with new budget-switcher + remove sidebar slot
- `apps/web/src/app/[locale]/(app)/onboarding/page.tsx` — Phase 6 onboarding wizard target (`/budgets/new` placeholder lives here in Phase 3 as renamed route)
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — user-level `/settings`, kept untouched in Phase 3

### Backend touchpoints

- `apps/api/src/routes/budgets.ts` — add `GET /budgets/[id]/home-summary` (new endpoint owned by Phase 3)
- `apps/api/src/routes/tasks.ts` (or `tasks` sub-router under `/budgets/[id]/tasks`) — `GET ?status=pending` consumed by banner; Phase 7 wires writes but the read path must exist by end of Phase 3
- `packages/budgeting/src/application/` — new application service for `BudgetHomeSummary` if researcher recommends; alternative is composing existing services in the route layer
- `packages/budgeting/src/ports/fx-provider.ts` (from Phase 2) — reused for home-summary conversion

### CI gates & tests

- `make ci-gate` (6/6 tenant-leak) stays green after new routes
- New Playwright BDD `.feature` files under `apps/web/e2e/`: switcher / home-cards / tab-frame / task-banner
- Vitest component tests for new `BudgetSwitcher`, `BudgetCard`, `BdpTabs`, `TaskBanner`
- 80% domain coverage maintained (`bunfig.toml`)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/web/src/components/ui/popover.tsx` + `dropdown-menu.tsx` — drop-in for new `BudgetSwitcher`. Radix-backed, a11y-correct.
- `apps/web/src/components/ui/tabs.tsx` — Radix `Tabs` primitive; **needs a `pill` variant** (currently styled as underline tabs). Add `variant="pill"` prop or new `<PillTabs>` wrapper.
- `apps/web/src/components/ui/card.tsx` — base for `BudgetCard`. Add sectioned-layout variant.
- `apps/web/src/components/ui/badge.tsx` — type-badge (`PRIVATE`/`SHARED`) + kind-chip in task rows + currency code badge.
- `apps/web/src/components/common/brand-mark.tsx` — keeps the left brand slot on the new top-nav.
- `apps/web/src/lib/api-client.ts` — already points at `/budgets/*` (Phase 1 D-08). Add `homeSummary(id)` + `tasks.listPending(budgetId)` helpers.
- `apps/web/src/lib/budget-fetch.server.ts` + `budget-fetch.ts` — RSC fetch helpers; pattern reusable for `home-summary` and `tasks` reads.

### Established Patterns

- **`[locale]` route group** — next-intl locale prefix wraps everything; new routes (`/budgets/[id]/*`, `/budgets/new`) live inside `app/[locale]/(app)/`.
- **`(app)` route group** — auth-gated group with shared `layout.tsx`. New top-nav lives here; sidebar slot removed.
- **Hexagonal layering** — domain in `packages/budgeting/src/domain/`, ports in `packages/budgeting/src/ports/`, adapters in `packages/budgeting/src/adapters/persistence/`. New `home-summary` query stays inside this layout — no Drizzle imports in domain.
- **Middleware `X-Budget-ID` header** — Phase 1 D-10. All `/budgets/[id]/*` backend reads use this header for tenant guard; web client pre-populates it from URL param.
- **TDD red→green** — write failing component test (Vitest+RTL) and failing route integration test (bun:test) before implementation. E2E BDD `.feature` per CLAUDE.md test matrix.

### Integration Points

- **Top-nav reuse** — single `<TopNav>` component lives in `(app)/layout.tsx`, consumed by `/`, `/budgets/[id]/[tab]`, `/budgets/new`, `/settings`. Renders `<BrandMark>` + `<BudgetSwitcher>` + `<NewBudgetButton>` + `<UserMenu>`.
- **Task banner ↔ tasks endpoint** — `GET /budgets/[id]/tasks?status=pending` must exist by Phase 3 ship. Phase 7 owns writes + generators; Phase 3 owns the read endpoint contract.
- **Home cards ↔ `home-summary` endpoint** — new Phase 3 backend route. FX conversion happens here (D-PH3-12) using Phase 2's `fxProvider`. Tests cover: zero wallets → 0, mixed-currency wallets convert correctly, overspent-strip empty when no category overspent.
- **Active-tab state** — derived from `usePathname()`. No client state; URL is source of truth (D-PH3-04).
- **i18n key fallbacks** — Phase 3 ships keys for `nav.*` / `home.*` / `bdp.*` across EN/PL/UK. Task-related keys (`tasks.title.*`, `tasks.kind.*`) lazy — Phase 7 fills; until then, `t()` returns the key string, acceptable as placeholder.

</code_context>

<specifics>
## Specific Ideas

- **Home cards layout is explicitly provisional.** User: "Keep in mind that it's temporary solution and later I'll think harder on it and provide you list of tiles I want to see there, but for now it's fine." Treat the sectioned-card layout (D-PH3-10) as scaffold that lets Phase 4–7 land — expect a v2 redesign request once Phase 4 grid + Phase 7 tasks are real.
- **Yellow accent discipline** — DESIGN.md "Don't" rule is sacred. Yellow used ONLY for active tab pill, primary CTA buttons (`+ New budget` icon button stays neutral, not yellow), and brand mark. Reject any future suggestion to recolor inactive UI in yellow.
- **Sticky behavior is a single container** — task banner + pill tabs share one `position: sticky` wrapper so the layout doesn't visibly split when expand/collapse animates.

</specifics>

<deferred>
## Deferred Ideas

- **Home dashboard v2 — custom tile list** — user will hand a specific list of tiles to render in place of the current "card per budget" scaffold once the Phase 4 grid + Phase 7 task surface exist. Treat current home-cards layout as a Phase 3 scaffold, not a permanent design. Captured per user request 2026-05-12.
- **Real-time task banner (SSE / WebSocket)** — current decision is 60s poll. If post-launch users report staleness pain on Phase 7 tasks, swap the hook to Hono SSE backed by Postgres `LISTEN/NOTIFY`. Phase 8 candidate.
- **Searchable budget switcher (cmdk)** — defer until a single user owns > 15 budgets, which is unlikely at v1.1. `command.tsx` primitive is already in `ui/` so the swap is cheap when needed.
- **Per-card chart sparkline** — explicitly out of scope (HOME-04 says placeholder only). Phase 8+ once Insights domain ships.
- **Voice STT, LLM onboarding suggestions, comparison context, email digest** — v1.1-SPEC §15 explicitly out of scope; do not surface in Phase 3 UI.
- **Scroll-aware sticky shrink for pills** — rejected for v1.1 (D-PH3-01); revisit only if usability testing flags vertical-space pressure on mobile Spendings grid (Phase 4).

</deferred>

---

_Phase: 3-Navigation, Home & BDP Frame_
_Context gathered: 2026-05-12_
