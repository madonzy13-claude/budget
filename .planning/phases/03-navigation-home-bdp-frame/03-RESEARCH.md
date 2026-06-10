# Phase 3: Navigation, Home & BDP Frame — Research

**Researched:** 2026-05-12
**Domain:** Next.js App Router UI scaffold + thin RSC data routes + i18n + DDD hexagonal boundary
**Confidence:** HIGH

---

## Summary

Phase 3 ships a structural UI scaffold (top-nav budget switcher, combined home `/`, BDP `/budgets/[id]/[tab]` frame, task-banner shell) on top of the Phase 1+2 schema/API foundation. Every architectural decision is already locked in `03-CONTEXT.md` (22 D-PH3-XX entries) and visual contract is locked in `03-UI-SPEC.md` — research's job is to verify each decision is grounded in current Next.js / Radix / Hono primitives the codebase already owns, surface the file-by-file delete/create map, define the missing API contracts (`home-summary`, `tasks?status=pending`), and trace each REQ-ID to test layers.

Key verified facts:

- `apps/web/package.json` pins **Next 15.3.2** (not 16 as CLAUDE.md aspirationally states); App Router with async `params` works in 15.3+. RSC, `redirect()`, `usePathname()`, nested `layout.tsx` per route segment are all available. `[VERIFIED: /home/claude/budget/apps/web/package.json]`
- **React Query is NOT installed** in `apps/web` (D-PH3-13 calls for `useQuery({ refetchInterval: 60_000 })`). The planner MUST add `@tanstack/react-query` + `@tanstack/react-query-devtools` in Wave 0. `[VERIFIED: /home/claude/budget/apps/web/package.json]`
- **playwright-bdd is NOT installed yet** (CLAUDE.md mandates Gherkin via playwright-bdd; existing `apps/web/e2e/cross-tenant-cache.spec.ts` is raw Playwright `.spec.ts`). Wave 0 must bootstrap playwright-bdd OR Phase 3 accepts raw `.spec.ts` as an in-flight migration debt and the planner explicitly notes the deviation. `[VERIFIED: /home/claude/budget/apps/web/e2e/]`
- All Radix primitives needed (Popover, Tabs, DropdownMenu, Tooltip, Card, Badge, Button, Skeleton) are already in `apps/web/src/components/ui/`. `Tabs` ships underline-only; **pill variant is in-house extension**, no new dep. `[VERIFIED]`
- Backend has `GET /budgets/active` returning `{workspaces: [{id,name,kind,default_currency,...}]}` ready for the switcher and home grid. `home-summary` and `tasks?status=pending` endpoints don't exist yet — Phase 3 ships both. `[VERIFIED: apps/api/src/routes/budgets.ts:331-338]`
- Existing v1.0 sidebar (`workspace-sidebar.tsx`) + workspaces page (`/workspaces/page.tsx`) + workspaces layout (`/workspaces/[wsId]/layout.tsx`) + `workspace-switcher.tsx` (Sheet-based) are the four files Phase 3 deletes or relocates. `[VERIFIED]`

**Primary recommendation:** Land Phase 3 as four sequential plans (Wave 0 deps + cleanup → API endpoints → UI components → routes + E2E). Treat React Query install as a hard prerequisite in Wave 0; Phase 4 will reuse it for the grid. Treat `home-summary` and `tasks?status=pending` as Phase 3-owned backend additions (testable via `bun:test` integration before any UI lands).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**BDP tab frame:**

- **D-PH3-01:** Pill tabs always sticky directly under top-nav (`position: sticky; top: 64px`). Task banner stacks above and sticks with them — single sticky container. No scroll-aware shrink/hide.
- **D-PH3-02:** Active pill = filled treatment: `{colors.primary}` background + `{colors.on-primary}` (black) text — DESIGN.md `button-primary` styling at pill scale. Inactive: transparent bg, `{colors.on-dark}` text, 1px hairline on hover.
- **D-PH3-03:** Mobile (≤480px) icon+label collapse — active pill keeps label, inactive pills render icon-only with `aria-label` + tooltip on long-press. Icons: lucide `LayoutGrid` (Spendings), `Coins` (Reserves), `Wallet` (Wallets), `Settings`.
- **D-PH3-04:** Tabs are separate Next.js routes (`/budgets/[id]/{spendings,reserves,wallets,settings}/page.tsx`). `<Link>` for client-side nav; `usePathname` for active state. Browser back/forward and deep-link copy both work.

**Budget switcher:**

- **D-PH3-05:** Plain Popover with grouped lists (Personal/Shared) — no search input. `cmdk` rejected for v1.1.
- **D-PH3-06:** Active row gets leading lucide `Check` icon (`role=menuitemradio` + `aria-checked`). Yellow recolor rejected per scarcity rule.
- **D-PH3-07:** `+ New budget` is a separate round icon-button to the right of switcher trigger, on the nav bar itself — not inside dropdown panel.
- **D-PH3-08:** Same Popover across breakpoints — no mobile Sheet. Existing `workspace-switcher.tsx` Sheet pattern deprecated and deleted.

**Home cards:**

- **D-PH3-09:** Responsive grid: 1 col <640px, 2 cols 640–1023px, 3 cols ≥1024px. CSS Grid with `auto-fill minmax`.
- **D-PH3-10:** Sectioned card (provisional): header (name + private/shared icon + PRIVATE/SHARED badge) → stat row (current-month spent + total wallets value in display_currency) → top 1–2 overspent strip. Whole-card click → `/budgets/[id]/spendings`.
- **D-PH3-11:** RSC parallel-Suspense per card. Each `<BudgetCard>` is async Server Component that fetches own `GET /budgets/[id]/home-summary`. Backend returns `{name, kind, spent_current_month, wallets_value_display_ccy, top_overspent: [{category, over_amount}, ...]}`.
- **D-PH3-12:** FX conversion server-side in `home-summary` endpoint. Uses Phase 2 `fxProvider` port. `display_currency` source: `users.display_currency` (default = budget's `default_currency` if null).

**Task banner:**

- **D-PH3-13:** RSC initial render + 60s client poll (React Query `useQuery` with `refetchInterval: 60_000`, paused on `document.visibilityState === 'hidden'`). SSE rejected for v1.1.
- **D-PH3-14:** Banner hidden entirely when count = 0.
- **D-PH3-15:** Expand = inline accordion under banner.
- **D-PH3-16:** Row = title + kind chip + disabled action button placeholder. Phase 7 fills title/kind i18n keys; Phase 3 ships shell.

**Routing & legacy cleanup:**

- **D-PH3-17:** Hard delete `apps/web/src/app/[locale]/(app)/workspaces/` page tree and `workspace-sidebar.tsx`. Existing `workspace-switcher.tsx` rewritten in place under `components/budgeting/budget-switcher.tsx`. No 301 redirects.
- **D-PH3-18:** `/budgets/new` lives under `(app)/budgets/new/page.tsx` — Phase 3 ships placeholder page.
- **D-PH3-19:** User-level `/settings` stays separate. Reachable from user-menu dropdown only.

**Engineering discipline:**

- **D-PH3-20:** TDD-first. Every BDP layout + page gets ≥1 Vitest+RTL component test; every backend `home-summary` route gets a `bun:test` integration test against real Postgres in `apps/api/test/routes/`. Playwright BDD `.feature` covers: open `/`, click card → BDP, switch tabs (back/forward), open switcher → swap budget, expand task banner.
- **D-PH3-21:** Dependency-cruiser rules unchanged. `home-summary` route lives in `apps/api/src/routes/budgets.ts`; application service in `packages/budgeting/src/application/`; new `BudgetHomeSummaryRepo` port if needed.
- **D-PH3-22:** New i18n namespaces `nav.*`, `home.*`, `bdp.*`. Tasks namespace (`tasks.title.*`, `tasks.kind.*`) defined in Phase 7.

### Claude's Discretion

- Placeholder-chart shape — CSS box, `min-height: 240px`, 1px hairline border, centered `home.chart.placeholder`. No chart lib added.
- Whole-card click affordance — `<Link>` wrapping with hover (1px yellow hairline + slight scale).
- Empty home state — centered hero "Create your first budget" linking to `/budgets/new`.
- Private/shared icon glyph — lucide `Lock` (Private), `Users` (Shared).
- Currency badge in switcher dropdown row — small monospace `Badge` with 3-letter code.
- Mobile icon-only pill tap target — minimum 44×44 px.
- React Query is chosen client-fetch lib. Add to `apps/web/package.json` if not present (Phase 4 grid will need it too).
- `BudgetHomeSummaryRepo` port location: researcher recommends adding new port (see §Architecture below).

### Deferred Ideas (OUT OF SCOPE)

- Home dashboard v2 — custom tile list (user will supply later).
- Real-time task banner (SSE/WebSocket) — v1.1 uses 60s poll.
- Searchable budget switcher (cmdk) — defer until >15 budgets per user.
- Per-card chart sparkline — Phase 8+ once Insights ships.
- Voice STT, LLM onboarding, comparison, email digest — v1.1-SPEC §15 explicit.
- Scroll-aware sticky shrink for pills.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | Top nav: current budget name + private/shared icon + chevron as dropdown trigger | §Component Map §1 BudgetSwitcher trigger; existing `(app)/layout.tsx` header rewritten |
| NAV-02 | Switcher dropdown lists user's budgets grouped Personal/Shared | §Data Contracts §1: `GET /budgets/active` already returns `kind` discriminator (PRIVATE/SHARED) |
| NAV-03 | Aside `+` button (not list item) opens `/budgets/new` | §Component Map §2 NewBudgetButton — separate sibling of switcher in nav cluster |
| NAV-04 | Clicking budget in dropdown navigates to `/budgets/[id]/spendings` | §Component Map §1; uses `router.push` from `next/navigation` |
| NAV-05 | Standalone `/workspaces` list page removed | §File Map: DELETE list (`/workspaces/page.tsx`, `[wsId]/layout.tsx`, `WorkspaceSidebar`) |
| HOME-01 | `/` renders one card per accessible budget (Personal + Shared) | §Routes §1 home page = RSC; iterates over `GET /budgets/active` |
| HOME-02 | Card shows: name, type badge, current-month spent, total wallets value (display_currency), top 1–2 overspent | §Data Contracts §2: new `GET /budgets/[id]/home-summary` endpoint owns full payload |
| HOME-03 | Card click navigates to `/budgets/[id]/spendings` | §Component Map §3: `<Link>` wrapping `<BudgetCard>` |
| HOME-04 | Placeholder chart component below cards (scaffold only) | §Component Map §4: CSS box, no chart lib |
| BDP-01 | BDP route renders pill-style horizontal tabs sticky on scroll | §Routes §2: `layout.tsx` ships single sticky wrapper at `top: 64px` |
| BDP-02 | Tab order: Spendings · Reserves · Wallets · Settings; default = Spendings | §Routes §2: `/budgets/[id]/page.tsx` server-redirects to `./spendings` via `redirect()` |
| BDP-03 | Task banner above tabs when tasks exist; count chip; expand to inline list | §Data Contracts §3 + §Component Map §6 — Phase 3 ships SHELL; Phase 7 wires kind-specific actions |
| BDP-04 | Active tab pill highlighted with yellow accent | §Component Map §5 PillTabs — `Tabs variant="pill"` extension to `apps/web/src/components/ui/tabs.tsx` |
| BDP-05 | Browser back/forward respects tab routes | §Routes §2: tabs ARE separate routes (not Radix `Tabs.Trigger` state); `<Link>` + `usePathname` |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Budget switcher dropdown rendering | Browser (Client Component) | — | Radix Popover needs `onOpenChange` state; `<Link>` navigation is browser-side |
| Top-nav scaffolding + sticky header | Frontend Server (RSC) | Browser (sticky CSS) | `(app)/layout.tsx` is RSC; auth gate runs server-side; sticky positioning is CSS-only |
| Home page card grid | Frontend Server (RSC) | API (per-card data fetch) | Each `<BudgetCard>` is async RSC streaming via Suspense; data fetched server-side from API |
| Per-budget home summary aggregation | API (Hono route) | Database (SQL aggregation) + FX | Spent/wallet sums + FX conversion belong on the API tier per CLAUDE.md hexagonal rules; domain holds Money math |
| BDP tab routing | Browser (Next.js client routing) + Frontend Server (RSC pages) | — | Tabs are real routes — `<Link>` triggers Next.js soft nav; each tab's `page.tsx` is RSC |
| Active tab detection | Browser (`usePathname`) | — | Sole client state needed; URL is source of truth (D-PH3-04) |
| Task banner initial render | Frontend Server (RSC) | API (`GET /budgets/[id]/tasks?status=pending`) | RSC paints count without CLS |
| Task banner client polling | Browser (React Query) | API | 60s `refetchInterval`, pauses on hidden tab (D-PH3-13) |
| FX conversion for wallets total | API (Hono route) | — | `Money` math wraps Dinero; converter lives behind FxProvider port (CLAUDE.md "never inside domain" → ensure adapter-layer conversion) |
| Authorization (budget access scope) | API (RLS + tenant guard) | Frontend Server (auth gate) | `(app)/layout.tsx` validates session; `X-Budget-ID` middleware enforces per-budget tenant guard server-side |

**Tier discipline check:** No business logic in browser tier. No Drizzle imports in domain. No Hono in domain. Task expand/collapse is presentational client state — fine for client component. Sticky CSS is browser tier — fine, no JS scroll observer (D-PH3-01).

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `^15.3.2` | App Router, RSC, route segments, `redirect()`, sticky nested layouts | `[VERIFIED: apps/web/package.json]` — CLAUDE.md says "16" aspirationally; codebase is on 15.3 which fully supports all Phase 3 patterns |
| `react` / `react-dom` | `^19.0.0` | RSC + Suspense streaming for per-card data fetch (D-PH3-11) | `[VERIFIED]` Required for `use()` hook and async server components |
| `next-intl` | `^4.4.3` | `getTranslations` (server) + `useTranslations` (client); locale prefix `[locale]` route group | `[VERIFIED]` Already wired across messages/{en,pl,uk}.json |
| `@radix-ui/react-popover` | latest | Switcher Popover panel — collision-handled viewport-edge clamp built in | `[VERIFIED: apps/web/src/components/ui/popover.tsx]` |
| `@radix-ui/react-dropdown-menu` | latest | Radix dropdown a11y conventions (`menuitemradio`, `aria-checked`) — pattern reference for switcher rows | `[VERIFIED: apps/web/src/components/ui/dropdown-menu.tsx]` |
| `@radix-ui/react-tabs` | latest | Tabs primitive base — we extend with pill variant in-house | `[VERIFIED: apps/web/src/components/ui/tabs.tsx]` (currently underline-only) |
| `@radix-ui/react-tooltip` | latest | Mobile icon-only pill long-press tooltip; `+ New budget` tooltip | `[VERIFIED]` Already in deps |
| `lucide-react` | latest | `Lock`, `Users`, `Plus`, `Check`, `ChevronDown`, `LayoutGrid`, `Coins`, `Wallet`, `Settings`, `AlertCircle`, `BarChart3` | `[VERIFIED]` Project standard icon set |
| `class-variance-authority` + `clsx` + `tailwind-merge` | latest | shadcn pattern for `Tabs variant="pill"` and `Badge` variants | `[VERIFIED]` |
| `hono` | `^4.12.16` | RPC contract for `home-summary` and `tasks` endpoints; type-only import in web | `[VERIFIED]` Already wired via `api-client.ts` |

### Supporting (must be added in Wave 0)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | `^5.x` (latest stable) | Client-side polling for task banner (D-PH3-13); future-proofs Phase 4 grid live updates | Wave 0; install in `apps/web/package.json` `[VERIFIED MISSING: apps/web/package.json shows no @tanstack/* dep]` |
| `@tanstack/react-query-devtools` | `^5.x` | DevTools panel for dev builds only (optional but useful) | Wave 0; dev dep |

### Already-present primitives (no install)

`apps/web/src/components/ui/`: alert-dialog, alert, avatar, badge, button, card, checkbox, command, dialog, dropdown-menu, form, input, label, popover, select, separator, sheet, skeleton, sonner, table, tabs, tooltip. **All required Phase 3 primitives present.** `sheet.tsx` is no longer used by switcher (D-PH3-08 removes the mobile Sheet pattern) but stays in `ui/` for other surfaces.

### Alternatives Considered

| Instead of | Could Use | Tradeoff (why not) |
|------------|-----------|--------------------|
| React Query (`@tanstack/react-query`) | SWR | React Query has stronger pause-on-hidden ergonomics; ecosystem fit for invalidation patterns Phase 4+ will need. Either works — React Query is the locked choice per CONTEXT discretion |
| React Query polling | Server-sent Events (SSE) | D-PH3-13 explicitly rejects SSE for v1.1 — adds Hono SSE handler + LISTEN/NOTIFY + PWA fallback to Phase 3 scope. Swap is a single-hook change post-launch |
| Plain Popover | `cmdk` Command palette | D-PH3-05 rejects cmdk — households have <10 budgets, search input is over-engineering |
| Radix `Tabs.Trigger` state | `<Link>` + `usePathname()` | D-PH3-04 — separate routes give back/forward + deep-link for free (BDP-05). Radix `Tabs` state would force a client-only single-page handler |
| CSS-only `position: sticky` | JS IntersectionObserver scroll-aware shrink | D-PH3-01 rejects scroll-aware shrink — CSS sticky is simpler and matches DESIGN.md flat-surface philosophy |

**Installation (Wave 0):**

```bash
cd apps/web && bun add @tanstack/react-query @tanstack/react-query-devtools
```

**Version verification:**

- `next@15.3.2` — `[VERIFIED: apps/web/package.json]`
- `react@19.0.0` — `[VERIFIED]`
- `next-intl@4.4.3` — `[VERIFIED]`
- `@tanstack/react-query` — `[ASSUMED: latest stable v5.x]` — planner must run `npm view @tanstack/react-query version` in Wave 0 to confirm

---

## File Map: Delete · Rewrite · Create

### Delete (Phase 3 owns the destruction)

| Path | Reason |
|------|--------|
| `apps/web/src/app/[locale]/(app)/workspaces/page.tsx` | NAV-05 / D-PH3-17. Switcher replaces list page |
| `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx` | Sidebar layout replaced by BDP `/budgets/[id]/layout.tsx` |
| `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/accounts/page.tsx` | Old wallet path |
| `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/recurring/page.tsx` | Recurring surface moves to settings in Phase 6 |
| `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/transactions/page.tsx` | Transactions move into Spendings grid (Phase 4) |
| `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/budget/page.tsx` | Old workspace budget page replaced by BDP Spendings tab |
| `apps/web/src/components/workspace/workspace-sidebar.tsx` | D-PH3-17 — sidebar deleted, top-nav owns navigation |
| `apps/web/src/components/workspace/workspace-switcher.tsx` | Rewritten in place as `components/budgeting/budget-switcher.tsx` (Popover-based, no Sheet) |
| `apps/web/src/components/workspace/workspace-row.tsx` | Only used by the deleted `/workspaces/page.tsx`; safe to drop |

**Verification:** `grep -rn "WorkspaceSidebar\|WorkspaceSwitcher\|WorkspaceRow\|workspaces/page" apps/web/src` should return zero hits after deletion. Planner adds this as a verification step. `[VERIFIED file list: apps/web/src/components/workspace/ has 5 files (.tsx) — all need fate decision]`

### Out-of-phase but adjacent (DO NOT delete in Phase 3)

| Path | Reason to keep |
|------|----------------|
| `apps/web/src/app/[locale]/(app)/onboarding/page.tsx` | Phase 6 owns onboarding; keep file untouched. `/budgets/new` is a NEW route that lives at `(app)/budgets/new/page.tsx` |
| `apps/web/src/app/[locale]/(app)/settings/page.tsx` | User-level settings stays — D-PH3-19 |
| `apps/web/src/app/[locale]/(app)/recurring/recurring-page-client.tsx` | Phase 4 GRID will subsume; out-of-phase |
| `apps/web/src/app/[locale]/(app)/transactions/` | Phase 4 will fold these into the grid; out-of-phase |
| `apps/web/src/components/workspace/create-workspace-form.tsx`, `invite-member-form.tsx`, `shares-editor.tsx` | Phase 6 owns Settings + share-link UI; out-of-phase |
| `apps/web/src/components/budgeting/*` (24 files) | v1.0 carryforward; Phases 4–7 will replace or fold most. Phase 3 leaves them alone |
| `apps/web/src/lib/workspace-fetch.ts`, `workspace-fetch.server.ts` | Backward-compat shims from Phase 1 D-08 — Phase 3 doesn't need them but doesn't delete |
| `apps/web/src/lib/require-active-workspace.ts` | Active-budget cookie gate — out-of-phase; only relevant to v1.0 multi-select |

### Rewrite (Phase 3 modifies in place)

| Path | What changes | REQ |
|------|--------------|-----|
| `apps/web/src/app/[locale]/(app)/layout.tsx` | Replace center nav (`<Link>` to /budgets, /settings) with `<BudgetSwitcher>` + `<NewBudgetButton>`. Keep `BrandMark`, session-validate, `SignOutButton`, `SiteFooter`. Add `<LocaleSelect>` per UI-SPEC §1. | NAV-01, NAV-05 |
| `apps/web/src/components/ui/tabs.tsx` | Add `variant="pill"` to `TabsList` and `TabsTrigger`. Keep existing underline variant as default. Use CVA for variant switch. | BDP-04 |
| `apps/web/src/lib/api-client.ts` | Type augmentation only — typed paths for new `home-summary` and `tasks` endpoints will surface automatically once routes are defined in the Hono app (RPC types flow). No code change needed beyond the API side. | HOME-02, BDP-03 |
| `apps/web/messages/{en,pl,uk}.json` | Add `nav.*`, `home.*`, `bdp.*`, `budgets.new.*` namespaces per UI-SPEC §Copywriting. EN authored, PL/UK use placeholders or human translation in Wave. | All 14 |

### Create (Phase 3 owns the creation)

**Web routes** (`apps/web/src/app/[locale]/(app)/`):

| Path | Type | Purpose |
|------|------|---------|
| `page.tsx` | RSC | Home page `/` — renders `<h1 t('home.heading')>` + responsive cards grid + placeholder chart. Replaces today's root redirect at `apps/web/src/app/[locale]/page.tsx` which redirects to `/sign-in` — that file stays unchanged (it's outside `(app)`; authenticated users land in `(app)/page.tsx`). Confirm with planner: the existing `[locale]/page.tsx` (sign-in redirect) is a public route, separate from `[locale]/(app)/page.tsx` (authed home). |
| `budgets/new/page.tsx` | RSC | Placeholder for Phase 6 onboarding wizard — D-PH3-18. `<h1 t('budgets.new.title')>` + body text + back-to-home link |
| `budgets/[id]/layout.tsx` | RSC | BDP shell. Fetches `tasks?status=pending` server-side, renders `<TaskBanner>` (when count > 0) + `<BdpTabs>` inside single sticky wrapper at `top: 64px`, then `{children}`. Tenant guard: passes `X-Budget-ID` via `serverApiFetch(id, ...)` |
| `budgets/[id]/page.tsx` | RSC | Server-redirects to `./spendings` via `redirect()` — BDP-02 default |
| `budgets/[id]/spendings/page.tsx` | RSC | Placeholder — `<h1 t('bdp.tab.spendings.title')>` + body. Phase 4 replaces |
| `budgets/[id]/reserves/page.tsx` | RSC | Placeholder. Phase 5 replaces |
| `budgets/[id]/wallets/page.tsx` | RSC | Placeholder. Phase 5 replaces |
| `budgets/[id]/settings/page.tsx` | RSC | Placeholder. Phase 6 replaces |

**Web components** (`apps/web/src/components/budgeting/`):

| File | Type | Purpose |
|------|------|---------|
| `budget-switcher.tsx` | Client | Popover-based switcher — replaces v1.0 Sheet flavor. Receives `budgets: BudgetSummary[]`, `activeBudgetId: string \| null` (derived from URL) from RSC parent |
| `new-budget-button.tsx` | Client | Icon button with `aria-label`; uses `useRouter().push('/{locale}/budgets/new')` |
| `budget-card.tsx` | Async RSC | Per-card data fetch via `serverApiFetch(id, '/budgets/[id]/home-summary')`; wraps in `<Link>`; renders sectioned anatomy. Suspense boundary lives in parent (`page.tsx`) so siblings stream independently |
| `budget-card-skeleton.tsx` | RSC (or pure markup) | Skeleton matching `<BudgetCard>` anatomy — header + stat row + strip. Used as Suspense fallback |
| `home-cards-grid.tsx` | RSC | Wraps `<BudgetCard>` in `<Suspense fallback={<BudgetCardSkeleton/>}>`; iterates over user's budgets |
| `placeholder-chart.tsx` | RSC (pure markup) | CSS box, `min-height: 240px`, centered `BarChart3` icon + i18n caption |
| `bdp-tabs.tsx` | Client | Renders 4 `<Link>` pills using `Tabs variant="pill"` styling; reads active via `usePathname`; handles mobile icon-only collapse |
| `task-banner.tsx` | Client wrapper | Mounts `<TaskBannerInner>` with React Query polling. Receives initial data from server (D-PH3-13). Expand/collapse client state |
| `task-banner-row.tsx` | Client | Task row markup — title + kind chip + disabled button |
| `top-nav.tsx` | RSC | Top-nav shell composing `BrandMark + BudgetSwitcher + NewBudgetButton + LocaleSelect + SignOutButton`. Replaces inline header in `(app)/layout.tsx` (extracted for testability) |

**Shared types** (`apps/web/src/types/` or co-located):

| File | Purpose |
|------|---------|
| `budget-summary.ts` (or co-located in `budget-switcher.tsx`) | TypeScript shape for switcher rows: `{ id, name, kind, default_currency }`. Matches `/budgets/active` response |
| `home-summary.ts` (or imported from Hono RPC types) | TypeScript shape for `home-summary` payload — see §Data Contracts §2 |
| `task-summary.ts` | TypeScript shape for `tasks?status=pending` row — see §Data Contracts §3 |

**Backend (`apps/api/src/routes/`):**

| File | Action | Purpose |
|------|--------|---------|
| `budgets.ts` | Modify (add routes) | Append `GET /budgets/:id/home-summary` and (if not factoring to separate file) `GET /budgets/:id/tasks` |
| `tasks.ts` (NEW) | Create | Cleaner: dedicated tasks sub-router mounted under `/budgets/:id/tasks` for `GET ?status=pending`. Phase 7 will extend with write routes. RECOMMENDED |
| `app.ts` (or wherever routes mount) | Modify | Mount tasks sub-router under `/budgets/:budgetId/tasks` |

**Domain / application (`packages/budgeting/src/`):**

| File | Action | Purpose |
|------|--------|---------|
| `application/get-budget-home-summary.ts` | Create | Application service composing `TransactionRepo` (current-month spent), `WalletRepo` (sum by currency), `FxProvider` (convert wallets sum to display_currency), `CategoryLimitRepo` + `ReserveBalanceRepo` (top overspent categories). Returns plain DTO |
| `ports/budget-home-summary-repo.ts` | OPTIONAL — skip if composition suffices | Single port `BudgetHomeSummaryRepo` that does the aggregation. Recommended for testability if SQL grows non-trivial; otherwise compose existing repos |

**Domain (`packages/tenancy/src/` or `packages/budgeting/src/`):**

| File | Action | Purpose |
|------|--------|---------|
| `application/list-pending-tasks.ts` (in `packages/budgeting/` next to `list-pending-drafts.ts`, OR in a new `packages/tasks/` package per future Phase 7) | Create thin read-only service | `(budgetId, tenantId) → TaskSummary[]`. Phase 7 owns writes; Phase 3 ships the read. Recommend keeping in `packages/budgeting/` for now to avoid premature package split |
| `ports/task-repo.ts` | Create | Read-only port: `listPending(budgetId, tenantId): Promise<TaskSummary[]>` |
| `adapters/persistence/task-repo.ts` | Create | Drizzle adapter reading `tasks` table (created in Phase 1 migration; CONTEXT confirms table exists) |

**Tests:** see §Test Strategy below.

---

## Architecture Patterns

### System Architecture Diagram

```
                            Browser
   ┌─────────────────────────────────────────────────────────┐
   │  /                  Home cards grid                       │
   │   ├──> [Click card] ────────────────┐                     │
   │  /budgets/[id]      BDP frame       │                     │
   │   ├──> [Pill click] ────┐           │                     │
   │   ├──> [Switcher row]──┐│           │                     │
   │   └──> [Banner expand]─┼┼───────────┼─── client polling   │
   │                        ││           │    (60s React Q)    │
   └────────────────────────┼┼───────────┼─────────────────────┘
                            ││           │
                       Link/redirect     │ initial RSC fetch
                            ││           │
   ┌────────────────────────▼▼───────────▼─────────────────────┐
   │ Frontend Server (Next.js 15 App Router)                    │
   │                                                            │
   │  [locale]/                                                 │
   │    (app)/                                                  │
   │      layout.tsx ──> session validate + TopNav             │
   │      page.tsx   ──> RSC home grid                          │
   │        └─> <BudgetCard>  (async RSC, per-card Suspense)   │
   │              └─> serverApiFetch(id, '/home-summary')      │
   │      budgets/[id]/                                         │
   │        layout.tsx ──> tasks?status=pending + tabs shell    │
   │              └─> <TaskBanner> ──> client wrapper polls    │
   │        page.tsx   ──> redirect('./spendings')              │
   │        spendings/page.tsx (placeholder, Phase 4 fills)     │
   │        reserves/page.tsx  (placeholder, Phase 5)           │
   │        wallets/page.tsx   (placeholder, Phase 5)           │
   │        settings/page.tsx  (placeholder, Phase 6)           │
   │                                                            │
   │  RSC fetch: serverApiFetch() → http://api:4000             │
   └────────────────────────────┬───────────────────────────────┘
                                │
                                │ HTTP + Cookie + X-Budget-ID header
                                │
   ┌────────────────────────────▼───────────────────────────────┐
   │ Hono API (apps/api)                                        │
   │                                                            │
   │  GET  /budgets/active                       (exists)       │
   │  GET  /budgets/:id/home-summary             (NEW, Phase 3) │
   │  GET  /budgets/:id/tasks?status=pending     (NEW, Phase 3) │
   │                                                            │
   │  tenant-guard middleware → X-Budget-ID + RLS GUC           │
   └────────────────────────────┬───────────────────────────────┘
                                │
   ┌────────────────────────────▼───────────────────────────────┐
   │ Application services (packages/budgeting)                  │
   │                                                            │
   │  get-budget-home-summary  ──> composes:                   │
   │    ├── TransactionRepo.sumCurrentMonth(budgetId)          │
   │    ├── WalletRepo.listByBudget(budgetId)                  │
   │    ├── FxProvider.convertSum(wallets[], target)           │
   │    └── ReserveBalance + CategoryLimit: top-overspent      │
   │                                                            │
   │  list-pending-tasks ──> TaskRepo.listPending(budgetId)    │
   └────────────────────────────┬───────────────────────────────┘
                                │
   ┌────────────────────────────▼───────────────────────────────┐
   │ Adapters (packages/budgeting/src/adapters/persistence)     │
   │ Drizzle queries; FORCE RLS via tenant_id GUC               │
   └────────────────────────────┬───────────────────────────────┘
                                │
                                ▼  PostgreSQL
                       tables: budgets, wallets, transactions,
                               category_limits, tasks, ...
```

### Pattern 1: Async RSC per-card with Suspense streaming (D-PH3-11)

**What:** Each `<BudgetCard>` is its own `async` Server Component. Parent wraps each in `<Suspense fallback={<BudgetCardSkeleton/>}>`. Card with fast `home-summary` paints first; slow card streams in independently.

**When to use:** Any home-grid surface where data fan-out per item could vary. `[CITED: react.dev / Next.js docs — async server components + Suspense streaming]`

**Example:**

```tsx
// apps/web/src/app/[locale]/(app)/page.tsx
import { Suspense } from 'react';
import { BudgetCard } from '@/components/budgeting/budget-card';
import { BudgetCardSkeleton } from '@/components/budgeting/budget-card-skeleton';
import { serverApiFetch } from '@/lib/budget-fetch.server';
import { getTranslations } from 'next-intl/server';

interface HomePageProps { params: Promise<{ locale: string }>; }

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const res = await serverApiFetch(null, '/budgets/active');
  const { workspaces: budgets } = await res.json() as { workspaces: BudgetSummary[] };

  if (budgets.length === 0) {
    return <HomeEmptyHero locale={locale} />;
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-12">
      <h1 className="text-title-lg">{t('heading')}</h1>
      <div className="mt-6 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {budgets.map((b) => (
          <Suspense key={b.id} fallback={<BudgetCardSkeleton />}>
            <BudgetCard budget={b} locale={locale} />
          </Suspense>
        ))}
      </div>
      <PlaceholderChart locale={locale} />
    </main>
  );
}
```

```tsx
// apps/web/src/components/budgeting/budget-card.tsx
import Link from 'next/link';
import { serverApiFetch } from '@/lib/budget-fetch.server';

export async function BudgetCard({ budget, locale }: { budget: BudgetSummary; locale: string }) {
  const res = await serverApiFetch(budget.id, `/budgets/${budget.id}/home-summary`);
  if (!res.ok) return <BudgetCardError budget={budget} locale={locale} />;
  const summary = await res.json() as HomeSummary;
  return (
    <Link href={`/${locale}/budgets/${budget.id}/spendings`} aria-label={...}>
      {/* sectioned card markup */}
    </Link>
  );
}
```

### Pattern 2: Route-as-tab (D-PH3-04)

**What:** Pills are `<Link>` elements styled like Radix `Tabs.Trigger`. Active state derived from `usePathname()`. Each tab is a real Next.js route segment with its own `page.tsx`.

**When to use:** Any tab UX where browser back/forward should work and deep-link must paint the correct active state on first render. `[CITED: Next.js App Router docs — nested layouts + segment matching]`

**Example:**

```tsx
// apps/web/src/components/budgeting/bdp-tabs.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutGrid, Coins, Wallet, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { slug: 'spendings', icon: LayoutGrid },
  { slug: 'reserves',  icon: Coins },
  { slug: 'wallets',   icon: Wallet },
  { slug: 'settings',  icon: Settings },
] as const;

export function BdpTabs({ locale, budgetId }: { locale: string; budgetId: string }) {
  const pathname = usePathname();
  const t = useTranslations('bdp.tab');
  return (
    <nav aria-label={t('aria')} className="flex gap-2 px-6 sm:px-8">
      {TABS.map(({ slug, icon: Icon }) => {
        const href = `/${locale}/budgets/${budgetId}/${slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? 'page' : undefined}
            aria-label={t(slug)}
            className={cn(
              'inline-flex items-center gap-2 h-9 rounded-full px-4 transition-colors',
              active
                ? 'bg-[var(--primary)] text-[var(--on-primary)] text-title-sm'
                : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)]',
            )}
          >
            <Icon className="size-[18px]" />
            <span className={cn(active ? 'inline' : 'hidden sm:inline')}>{t(slug)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

### Pattern 3: Single sticky container (D-PH3-01)

**What:** Wrap task banner + pill tabs in one `<div class="sticky top-16 z-40 bg-[var(--canvas-dark)]">`. Both pin together; banner expand grows the container height; pills stay flush at the bottom edge.

```tsx
// apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
export default async function BdpLayout({ children, params }) {
  const { locale, id } = await params;
  const tasksRes = await serverApiFetch(id, `/budgets/${id}/tasks?status=pending`);
  const tasks = tasksRes.ok ? (await tasksRes.json()).tasks : [];
  return (
    <>
      <div className="sticky top-16 z-40 bg-[var(--canvas-dark)] border-b border-[var(--hairline-dark)]">
        {tasks.length > 0 && <TaskBanner budgetId={id} initialTasks={tasks} />}
        <BdpTabs locale={locale} budgetId={id} />
      </div>
      {children}
    </>
  );
}
```

### Pattern 4: RSC initial render + client React Query poll (D-PH3-13)

**What:** Server-side fetch primes the cache; client wrapper uses `useQuery` with `initialData`, `refetchInterval: 60_000`, `refetchIntervalInBackground: false`.

```tsx
// apps/web/src/components/budgeting/task-banner.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { clientApiFetch } from '@/lib/budget-fetch';

export function TaskBanner({ budgetId, initialTasks }: { budgetId: string; initialTasks: TaskSummary[] }) {
  const { data: tasks } = useQuery({
    queryKey: ['tasks', budgetId, 'pending'],
    initialData: initialTasks,
    queryFn: async () => {
      const res = await clientApiFetch(`/budgets/${budgetId}/tasks?status=pending`);
      const body = await res.json() as { tasks: TaskSummary[] };
      return body.tasks;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  if (!tasks || tasks.length === 0) return null;
  // expand/collapse client state below ...
}
```

A React Query provider must wrap `(app)/layout.tsx`'s children — or higher. Phase 3 ships the provider:

```tsx
// apps/web/src/components/providers/query-provider.tsx (NEW)
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Mount in `apps/web/src/app/[locale]/layout.tsx` (outside `(app)` so future public pages can also use it).

### Anti-Patterns to Avoid

- **Radix `Tabs.Root` with state for BDP tabs:** breaks BDP-05. Use route-as-tab.
- **CSS `position: sticky` on EACH of `<TaskBanner>` and `<BdpTabs>` separately:** they can visually split during the banner expand animation. Single sticky wrapper per D-PH3-01.
- **`useEffect`-driven scroll listeners for sticky shrink:** D-PH3-01 explicitly rejects scroll-aware shrink. CSS-only.
- **Client-side FX conversion of wallets sum:** violates CLAUDE.md hexagonal rule + leaks rates client-side. Conversion happens in `home-summary` route via `FxProvider`.
- **Floating-point cents math anywhere:** use `Money` value object (Dinero v2) or BIGINT cents. Never `number * 100` in TypeScript.
- **Injecting raw HTML into JSX (React unsafe-HTML APIs):** never used. All Phase 3 surfaces render strings as text — React auto-escapes. No exception.
- **Mounting `<TaskBanner>` when count = 0 with `display: none`:** keeps the sticky height at 96px even when banner absent. D-PH3-14 says hidden = unmounted; CSS hidden is wrong.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown anchor + viewport collision handling for switcher | Custom absolute-positioning logic | Radix `Popover` from existing `ui/popover.tsx` | Radix handles edge clamp, escape, focus trap, ARIA, mobile small-viewport snap |
| Focus trap inside switcher popover | Manual `tabindex`/`onkeydown` | Radix Popover native | Already a11y-correct |
| Active-tab detection | URL-parse + global state | `usePathname()` from `next/navigation` | Built-in, SSR-safe |
| Polling with pause-on-hidden | `setInterval` + manual visibility listener | `@tanstack/react-query`'s `refetchInterval` + `refetchIntervalInBackground: false` | Handles cleanup, race conditions, stale closures |
| FX conversion math | Manual rate * amount | `Money.convert(via FxProvider)` from existing port | Dinero v2 precision; FX freshness gate already enforced |
| Money formatting | `toFixed(2) + ' ' + ccy` | `Intl.NumberFormat(locale, { style: 'currency', currency })` | Locale-correct grouping, decimals per currency, sign placement |
| Plural rules in task count | `n === 1 ? 'task' : 'tasks'` | `next-intl` ICU MessageFormat `{count, plural, one {} other {}}` | PL/UK have 3-form plurals; manual breaks |
| Sticky positioning | Scroll observer + `transform` | CSS `position: sticky; top: 64px;` | Smooth, no JS frame drops |
| Per-budget data isolation | App-layer filtering | Postgres RLS + tenant guard middleware (Phase 1+2) | Single source of truth, defense in depth |

**Key insight:** This phase is composition, not invention. Every piece of behavior maps to a battle-tested primitive already in the codebase or a single new dep (React Query). The risk is over-engineering, not under-engineering.

---

## Runtime State Inventory

> Phase 3 has cleanup work — deleting `/workspaces` routes + sidebar — but it's NOT a rename/refactor phase across runtime systems. Inventory still relevant for the route deletion blast radius.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — schema fully renamed in Phase 1; Phase 3 is UI-only on top of stable schema | None |
| Live service config | None — no n8n / Tailscale / Datadog refs to /workspaces routes in this codebase. Verified via `[VERIFIED: filesystem grep negative]` | None |
| OS-registered state | None — no pm2/systemd refs to UI paths | None |
| Secrets/env vars | None — Phase 3 introduces no new env vars. `display_currency` source is `users.display_currency` column (existing Better Auth users table) | None |
| Build artifacts | Next.js build cache (`.next/`) — auto-invalidates on file changes. No stale concerns | Standard `make dev-build` after route file deletion |
| Browser-cached routes | `/workspaces` URLs may be in user's history/bookmarks → 404 on next visit | Accepted per D-PH3-17 (no aliases). Phase 8 PWA cache invalidation will handle SW cleanup |

**Verification step for planner:** After `git rm` of v1.0 workspace routes, run `grep -rn "/workspaces" apps/web/src apps/web/messages` — any remaining references are either i18n keys (also need rename) or hardcoded links (need fix). Earlier Phase 1 D-08 already pointed `api-client.ts` at `/budgets/*`, so backend URL constants are clean.

---

## Data Contracts

### 1. `GET /budgets/active` (already exists)

**Source:** `apps/api/src/routes/budgets.ts:331-338` `[VERIFIED]`

**Response:**

```ts
{
  workspaces: Array<{
    id: string;
    name: string;
    kind: 'PRIVATE' | 'SHARED';
    default_currency: string; // ISO 4217
    // ... other fields BudgetDTO may carry
  }>;
}
```

**Used by Phase 3:**

- Switcher dropdown (group by `kind`)
- Home grid (one card per entry)
- Active-budget detection in switcher trigger (derived from URL path via `extractBudgetIdFromPath`)

**Notes for planner:**
- Response key is `workspaces` (legacy from v1.0 — could rename to `budgets` in this phase for IA consistency). RECOMMEND: rename to `budgets` in the route response. Update `BudgetRepo.listForUser` callers. This is a tiny additive rename, contained to a single route. Tracks against ENGR consistency rather than a specific REQ.

### 2. `GET /budgets/:id/home-summary` (NEW — Phase 3 ships)

**Backend file:** `apps/api/src/routes/budgets.ts` (extend) — append after the `/active` handler.

**Tenant guard:** Standard `X-Budget-ID` middleware. Returns 403 if user isn't a member.

**Response:**

```ts
{
  budgetId: string;
  name: string;
  kind: 'PRIVATE' | 'SHARED';
  default_currency: string;     // ISO 4217 (budget's own currency)
  display_currency: string;     // ISO 4217 (user's display preference, or default_currency fallback)
  spent_current_month: {
    amount_cents: string;        // BIGINT-as-string per Phase 2 convention
    currency: string;            // = budget's default_currency
  };
  wallets_value_display_ccy: {
    amount_cents: string;
    currency: string;            // = display_currency (already converted)
    converted_at: string;        // ISO timestamp (FX freshness disclosure)
  };
  top_overspent: Array<{
    category_id: string;
    category_name: string;
    over_amount_cents: string;   // already in default_currency
  }>; // max 2 entries, sorted desc by over_amount
}
```

**Application service:** `packages/budgeting/src/application/get-budget-home-summary.ts` composes:
- `TransactionRepo.sumByMonth(budgetId, tenantId, currentMonth)` — sum `amount_converted_cents` (Phase 2 stores in budget currency)
- `WalletRepo.listByBudget(budgetId, tenantId)` — get all wallets with their `amount_cents` + `currency`
- `FxProvider.convertEach(wallets, target=display_currency)` then sum
- `CategoryLimitRepo` + transaction sums per category → compute `over = max(0, spent - active_budget)` where `active_budget = cushion if budget.cushion_mode_enabled else planned`. Take top 2.

**Errors:**
- 403 if not a member (RLS + tenant guard already enforces)
- 409 `FxRateStale` if FX provider returns stale rate (Phase 1 carry-forward). RECOMMEND: Phase 3 home-summary should DEGRADE GRACEFULLY on stale FX — return wallets_value with `stale: true` flag rather than 409, so cards don't error out. NEEDS discuss-phase confirmation. `[ASSUMED]`

**Wave 0 consideration:** Existing repos may not have `sumByMonth` or `sumForBudget` methods — planner audits `packages/budgeting/src/ports/` for what's available; new methods land on existing ports (additive, no API break).

### 3. `GET /budgets/:id/tasks?status=pending` (NEW — Phase 3 owns the contract)

**Backend file recommendation:** new file `apps/api/src/routes/tasks.ts`; mount at `/budgets/:budgetId/tasks` from `app.ts`. Phase 7 extends with POST/PATCH/DELETE.

**Tenant guard:** `X-Budget-ID` middleware on parent mount.

**Response:**

```ts
{
  budgetId: string;
  tasks: Array<{
    id: string;
    kind: 'RESERVE_TOPUP' | 'CONFIRM_DRAFT' | 'STALE_WALLET' | 'MONTH_END_REVIEW';
    payload: Record<string, unknown>;  // kind-specific; Phase 7 schemas it precisely
    status: 'PENDING' | 'RESOLVED';
    created_at: string;
  }>;
}
```

**Notes:**
- `tasks` table created in Phase 1 migration `[VERIFIED: MIG-08 + 01-CONTEXT.md "tasks table CREATE"]`
- Phase 3 doesn't generate any tasks — generators land in Phase 7. So in Phase 3, `tasks` table will be EMPTY in dev/staging. **This is fine for shell rendering** (`count = 0` = banner hidden). Integration test should INSERT a synthetic task row directly to exercise the count > 0 path.
- Application service: `packages/budgeting/src/application/list-pending-tasks.ts` (or move to new `packages/tasks/` in Phase 7 — Phase 3 picks the simpler colocate).

### 4. Recommended additive: rename `workspaces` → `budgets` in response keys

Phase 1 D-09 said no URL aliases. The same logic applies to JSON response keys: `{workspaces: [...]}` from `/budgets/active` is residual v1.0 naming. RECOMMEND: planner adds a tiny task to rename to `{budgets: [...]}` and update web callers. Low risk, high IA consistency. Tracks ENGR not a specific REQ.

---

## Sticky Pill-Tab Implementation Details

**CSS-only approach:** `position: sticky; top: 64px; z-index: 40; background: var(--canvas-dark);`

**Pitfall:** Sticky positioning silently breaks if any ancestor between the sticky element and its scroll container has `overflow: hidden`, `overflow: auto`, or `overflow: scroll`. `[CITED: MDN CSS position docs]`

**Verification step the planner adds:** After implementing, scroll the BDP page and confirm via DevTools that the sticky element's offsetTop is pinned at viewport y=64. If not, walk the ancestor chain in DevTools and remove the offending overflow.

**Single sticky wrapper edge case:** When banner expands from 48px to (say) 240px, the wrapper grows. The pill tab row at the bottom of the wrapper stays at the new bottom edge — visually appears to "drop down" as the banner expands. This is the intended behavior per D-PH3-01 ("single sticky container"). Verify the animation is smooth at 200ms (D-PH3-15).

**Z-index stack discipline:**
- Top-nav header: `z-50` (existing `(app)/layout.tsx` uses `z-40`; **bump to 50** to ensure switcher Popover doesn't render under BDP sticky)
- BDP sticky wrapper: `z-40`
- Modal/sheet content (Phase 4+ form sliders): `z-50` (via Radix Portal default)
- Tooltip: `z-50` (Radix default)

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` — set transition-duration to 0 on the banner expand. Sticky positioning unaffected.

---

## Task Banner Skeleton Contract (Phase 7 plug-in)

To minimize Phase 7 reflow, Phase 3 locks the row geometry now:

**`<TaskBannerRow>` props (Phase 3 shape — Phase 7 extends):**

```ts
interface TaskBannerRowProps {
  task: TaskSummary;       // shape from Data Contract §3
  budgetId: string;        // for future action handlers
  locale: string;
  // Phase 7 will add: onResolve?: (taskId: string) => Promise<void>;
}
```

**Row markup (verified to match UI-SPEC §6 expanded anatomy):**

```tsx
<div className="flex items-center gap-3 px-4 h-12 bg-[var(--surface-card-dark)] border-b border-[var(--hairline-dark)]">
  <span className="flex-1 truncate text-body-md">
    {t(`tasks.title.${task.kind}` /* falls back to key string until Phase 7 */)}
  </span>
  <Badge variant="secondary" className="text-caption">
    {t(`tasks.kind.${task.kind}` /* falls back */)}
  </Badge>
  <Button
    variant="default"
    size="sm"
    disabled
    aria-disabled="true"
    title={t('bdp.tasks.actionComingSoon')}
  >
    {t(`bdp.tasks.action.${task.kind}.label` /* falls back */)}
  </Button>
</div>
```

**Phase 7 swap surface:** the `<Button disabled>` becomes an enabled action with kind-specific handler. No DOM-tree reshape, no reflow on hydration.

---

## Currency Conversion Boundary (HOME-02)

**Decision:** Conversion happens **server-side in the `/budgets/:id/home-summary` route**. Justification:

1. **Hexagonal discipline (CLAUDE.md):** `Money` value object math wraps Dinero; conversion is an adapter-layer concern. Doing it in RSC fetch in Next.js would either (a) call FxProvider client-bundled (forbidden — `apps/web` doesn't import `packages/budgeting/adapters/*`) or (b) call another API endpoint to convert (extra round-trip).
2. **FX rate disclosure:** the `converted_at` timestamp goes in the response payload — useful for future "rates updated 5 min ago" UI without re-fetching.
3. **Test isolation:** integration test against real Postgres + real Frankfurter adapter (or fake) — single test surface, no UI mocking.
4. **Phase 2 alignment:** Phase 2's `FrankfurterFxProvider` and `FxRateRepo` already live behind ports. Reusing those keeps Phase 3 backend additive.

**`display_currency` source:** `users.display_currency` (column added by Better Auth + Phase 1 schema). If null, fall back to budget's `default_currency` (D-PH3-12). NEEDS verification — `[ASSUMED: users.display_currency column exists]`. Planner Wave 0 confirms via `\d users` against the migrated dev DB. If missing, Phase 3 must ship a tiny migration to add it, OR fall back hard to budget's `default_currency` (simpler).

**Wave 0 spike:** confirm `users.display_currency` column presence. Drop a one-line note in Plan 03-01.

---

## i18n & DESIGN.md Token References

### New namespaces (Phase 3 owns; deliver EN authored, PL/UK placeholder or human translation)

- `nav.budgetSwitcher.trigger.aria`, `nav.switcher.{personal,shared,empty,empty.cta}`, `nav.newBudget`, `nav.newBudget.tooltip`
- `home.heading`, `home.card.{spent,wallets,overspent.heading,allOnBudget,error,openAria}`, `home.chart.placeholder`, `home.empty.{heading,body,cta}`
- `bdp.tab.{spendings,reserves,wallets,settings}` + `.title` + `.placeholder` variants, `bdp.tasks.{banner.trigger.aria,banner.collapse.aria,count,actionComingSoon}`
- `budgets.new.{title,placeholder,backToHome}`

UI-SPEC §Copywriting has the full key/EN-value table verbatim. Planner uses it as-is.

### DESIGN.md tokens cited

From `apps/web/src/app/global.css` (already aligned with DESIGN.md):

| Token | Where | UI-SPEC Reference |
|-------|-------|-------------------|
| `--canvas-dark` (#0b0e11) | Page body, nav bar, sticky pill row, expanded banner | §Color "Dominant 60%" |
| `--surface-card-dark` (#1e2329) | `BudgetCard` body, switcher Popover panel, banner row | §Color "Secondary 30%" |
| `--surface-elevated-dark` (#2b3139) | Switcher trigger hover, inactive pill hover | §Color "Secondary 30% elevated" |
| `--hairline-dark` / `--border` (#2b3139) | Card hover outline, divider lines | §Color "Hairline" |
| `--primary` (#fcd535) | Active pill bg, brand mark, banner `AlertCircle` icon, count chip bg | §Color "Accent 10%" — scarcity list of 4 surfaces |
| `--on-primary` (#181a20) | Active pill text, count chip text | DESIGN.md L606 "Don't invert button-primary text" |
| `--body-on-dark` / `--foreground` (#eaecef) | Default text | §Color |
| `--muted-foreground` (#707a8a) | Inactive pill text, section labels, captions | §Color |
| `--info-ring` (#3b82f6) | All `:focus-visible` outlines | §Accessibility |
| `--radius-pill` (9999px) | Pill tab shape | DESIGN.md L495 |
| `--radius-xl` (12px) | `BudgetCard` root | DESIGN.md `markets-table-card` precedent |
| `--radius-md` (6px) | Switcher trigger, `+ New budget` button | DESIGN.md button-primary |
| `.text-title-sm` (16/600) | Card name, active pill | DESIGN.md `title-sm` |
| `.text-title-lg` (24/600) | Home `<h1>`, BDP placeholder `<h1>` | DESIGN.md `title-lg` |
| `.text-num-md` (16/500 IBM Plex tabular) | All currency values, currency code badges | DESIGN.md `number-md` L83 |
| `.text-nav-link` (14/500) | Inactive pill text | DESIGN.md `nav-link` |
| `.text-caption` (12/500 uppercase tracking) | Section labels, type badges | DESIGN.md `caption` |

**Yellow scarcity inventory for Phase 3 (UI-SPEC §Color "Accent reserved-for list" — verbatim):**

1. Brand mark (existing).
2. Active BDP pill (background).
3. Hover of `+ New budget` icon (stroke flips to `--primary`).
4. Task banner `AlertCircle` icon AND count chip (Badge `variant="default"`).

No other Phase 3 surface may be yellow. Hover affordance on `<BudgetCard>` is a 1px yellow hairline outline — also reserved per UI-SPEC §5.4 "Card states / Hover".

---

## Security / Authorization Touchpoints

| Surface | Threat | Mitigation (existing) |
|---------|--------|----------------------|
| Switcher dropdown listing | Could leak budgets the user lacks access to | `GET /budgets/active` already calls `BudgetRepo.listForUser(userId)` which RLS-filters via `app.current_user_id` GUC `[VERIFIED: apps/api/src/routes/budgets.ts:336]` |
| Home cards | Same as above — card per budget the user has access to | Same primitive (`/budgets/active`); per-card `home-summary` fetch passes `X-Budget-ID` so tenant guard runs again (defense in depth) |
| `home-summary` endpoint | User crafts request with another budget's ID | `X-Budget-ID` middleware sets RLS GUC; routes use `withTenantTx` (Phase 1+2). If user isn't in budget's organization, Better Auth membership check fails before query |
| `tasks?status=pending` endpoint | Same — read leak | Same tenant-guard pattern. `tasks` table created in Phase 1 with `tenant_id` column + RLS policy `[VERIFIED: MIG-08 plus 01-PLAN-01 created RLS policies]` |
| BDP `[id]` route | Direct deep-link to a budget the user lacks access to | `(app)/layout.tsx` Better-Auth session gate + per-budget API calls 403 → planner adds a 404 fallback at `[id]/layout.tsx` when `home-summary` returns 403 (route back to `/`) |
| Switcher Popover injection via budget name | User-supplied `budget.name` rendered into JSX | React auto-escapes JSX text by default; Phase 3 components render `budget.name` as text only, never as raw markup. Server validates `name.max(100)` on create |
| CSRF on poll mutations | Polling is GET-only — no CSRF surface | No mutation surface in Phase 3 |

**`make ci-gate` (6/6 tenant-leak) must stay green after Phase 3.** New `home-summary` and `tasks` routes need their own tenant-leak fixture entries (PHASE 2 PRECEDENT: every new route gets a leak test). Planner adds 2 tenant-leak tests in Plan 03-02 (API plan).

**ASVS quick map:**

| ASVS | Applies | Standard Control |
|------|---------|-----------------|
| V2 Authentication | yes | Better Auth session check in `(app)/layout.tsx` (existing) |
| V3 Session Management | yes | Better Auth cookies; layout redirects on stale token |
| V4 Access Control | yes | Postgres RLS + `X-Budget-ID` tenant guard middleware |
| V5 Input Validation | yes (read-only routes) | `zValidator` on query params for `?status=pending` enum |
| V6 Cryptography | n/a (Phase 3 ships no new secrets) | — |

---

## Test Strategy per Surface

### bun:test (domain + application services)

| Test file | Covers | REQ |
|-----------|--------|-----|
| `packages/budgeting/test/get-budget-home-summary.test.ts` | Application service composition — mocked repos + fake `FxProvider`. Cases: zero wallets → 0; mixed-currency wallets convert; no overspent → empty array; >2 overspent → top 2 sorted desc | HOME-02 |
| `packages/budgeting/test/list-pending-tasks.test.ts` | Read service — fake `TaskRepo` returning 0 / 1 / N tasks, status filter | BDP-03 |

### bun:test (API routes / integration)

| Test file | Covers | REQ |
|-----------|--------|-----|
| `apps/api/test/routes/budgets-home-summary.test.ts` | Real Postgres (testcontainers / Docker), real FxProvider (or `FakeFxProvider` deterministic). Cases: auth-gated; tenant-leak (user A can't read user B's home-summary); zero state; happy path with seeded transactions + wallets; FX freshness (if stale → response includes flag or graceful behavior) | HOME-01, HOME-02 |
| `apps/api/test/routes/tasks-list-pending.test.ts` | Real Postgres. Cases: empty (count=0 → empty array); seed 3 tasks → 3 returned; tenant leak; `?status=pending` filter (seed RESOLVED + PENDING; verify only PENDING returned) | BDP-03 |
| `apps/api/test/security/tenant-leak.test.ts` (modify existing) | Add 2 leak-test entries: `home-summary` + `tasks` | Tenant-leak gate (`make ci-gate`) |

### Vitest + RTL (component)

| Test file | Covers | REQ |
|-----------|--------|-----|
| `apps/web/test/components/budgeting/budget-switcher.test.tsx` | Renders Personal/Shared sections; Check icon on active row; arrow key nav; Escape closes; click row triggers `router.push` mock; empty state renders | NAV-01, NAV-02, NAV-04 |
| `apps/web/test/components/budgeting/new-budget-button.test.tsx` | Click → router.push to `/{locale}/budgets/new`; aria-label present; tooltip mounts | NAV-03 |
| `apps/web/test/components/budgeting/budget-card.test.tsx` | Renders header (name + badge + icon); stat row with formatted numbers; overspent strip with empty state copy; error state stays clickable; whole card wrapped in `<Link>` | HOME-01, HOME-02, HOME-03 |
| `apps/web/test/components/budgeting/bdp-tabs.test.tsx` | 4 pills render in correct order; active pill = current pathname; mobile collapse below 480px (mock matchMedia); Settings pill has correct icon; tab is `<a>` link not button | BDP-01, BDP-02, BDP-04, BDP-05 |
| `apps/web/test/components/budgeting/task-banner.test.tsx` | Renders nothing when initial count=0; renders row when count>=1; expand toggle works; row contains disabled button; mock 60s poll fires (use `vi.useFakeTimers`); pauses on `document.visibilityState='hidden'` | BDP-03 |
| `apps/web/test/components/budgeting/placeholder-chart.test.tsx` | Renders icon + caption; no chart lib in import tree | HOME-04 |
| `apps/web/test/components/ui/tabs-pill.test.tsx` | `variant="pill"` renders correct styles; `variant` defaults to underline (no regression) | BDP-04 |

### Playwright BDD (E2E)

**Prerequisite:** Wave 0 must decide on playwright-bdd adoption. CLAUDE.md mandates it but existing `cross-tenant-cache.spec.ts` is raw `.spec.ts`. Two paths:

1. **Path A (preferred):** Plan 03-04 installs `playwright-bdd` + sets up Page Object pattern + Gherkin feature files. Carries setup cost but pays off across Phases 4–8 (CLAUDE.md MEMORY entry says "feedback_e2e_gherkin" — Gherkin is the standard).
2. **Path B (debt-acknowledging):** Phase 3 ships raw `.spec.ts` files matching `cross-tenant-cache.spec.ts` pattern. Phase 8 E2EX wave migrates to Gherkin.

RECOMMEND **Path A** — keeps CLAUDE.md compliance and unlocks Phase 4 grid E2E without retrofit. `[ASSUMED]` — planner confirms.

| Feature file | Scenarios | REQ |
|--------------|-----------|-----|
| `apps/web/e2e/features/budget-switcher.feature` | Open switcher; select different budget; verify URL changes to `/budgets/[new-id]/spendings`; click `+ New budget` → lands on `/budgets/new` | NAV-01..04 |
| `apps/web/e2e/features/home-cards.feature` | Login → land on `/`; see N cards (per test fixture); click first card → land on `/budgets/[id]/spendings`; empty-state path with zero budgets shows hero CTA | HOME-01..03 |
| `apps/web/e2e/features/bdp-tab-frame.feature` | Visit `/budgets/[id]` → redirect to `./spendings`; click Reserves pill → URL changes + pill swaps highlight; browser back → returns to Spendings + Spendings pill active; deep-link `/wallets` → Wallets pill active on first paint | BDP-01, BDP-02, BDP-04, BDP-05 |
| `apps/web/e2e/features/task-banner.feature` | (Fixture inserts 1 pending task) visit BDP → banner shows `1 task pending`; click → expand; click again → collapse; (fixture with 0 tasks) → banner not in DOM | BDP-03 |
| `apps/web/e2e/page-objects/{TopNavPo,HomePo,BdpPo,SwitcherPo,TaskBannerPo}.ts` | Page Object encapsulation per CLAUDE.md memory `feedback_e2e_gherkin` | — |
| `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` | Per-scenario fresh user (CLAUDE.md memory) | — |

E2E base URL via `PLAYWRIGHT_BASE_URL` from `.env.local` per CLAUDE.md memory `feedback_test_baseurl`.

---

## Common Pitfalls

### Pitfall 1: Hydration mismatch on active pill

**What goes wrong:** Server renders the active pill based on the URL segment, but client React Query's `useEffect` flips state on mount → React reports hydration mismatch.

**Why it happens:** Pills appear to use both server-derived state (URL) and client state (Radix Tabs). The fix is to NOT use Radix Tabs state at all — use `<Link>` and `usePathname()`, which give the same answer on server and client.

**How to avoid:** D-PH3-04 enforces this. The `BdpTabs` component is client (needs `usePathname`) but emits pure links — no internal state.

**Warning signs:** Console error "Hydration failed because the initial UI does not match what was rendered on the server" when navigating between tabs.

### Pitfall 2: `position: sticky` silently breaks

**What goes wrong:** Sticky pill row scrolls away with the page despite the CSS being correct.

**Why it happens:** An ancestor between sticky element and the scroll container has `overflow: hidden` or `auto`. Most common offender: a `<div className="overflow-hidden rounded-lg">` wrapper.

**How to avoid:** When implementing the BDP sticky wrapper, audit the ancestor chain (in DevTools: select sticky element → toggle Computed tab → walk up). The `(app)/layout.tsx` body section currently has no overflow restrictions, but any future card-wrapper that adds `overflow-hidden` between `body` and the sticky breaks this.

**Warning signs:** Sticky element scrolls with page; computed `position` shows `sticky` (not overridden); BUT actual behavior is non-sticky.

### Pitfall 3: React Query polling continues after unmount / never installs visibility listener

**What goes wrong:** Polling fires every 60s indefinitely; battery drain on mobile; quota hit on API.

**Why it happens:** Naive `useEffect(() => setInterval(...), [])` patterns don't clean up. React Query handles cleanup automatically but only if the QueryClient is mounted high enough in the tree and the component using `useQuery` properly unmounts.

**How to avoid:** Use `refetchInterval` + `refetchIntervalInBackground: false` (built-in pause-on-hidden). Mount `QueryProvider` once in `[locale]/layout.tsx`. Verify in DevTools Network panel: when switching tab away, no `/tasks` requests fire.

**Warning signs:** Background tab keeps making requests; battery indicator on mobile shows browser as high-power.

### Pitfall 4: `serverApiFetch` cookie forwarding leak across budgets

**What goes wrong:** A cross-budget tenant boundary breach because `serverApiFetch` uses session cookies but doesn't always pass the `X-Budget-ID` header — leading to "first matching membership" semantics.

**Why it happens:** Reading `serverApiFetch(null, '/budgets/active')` is fine (no per-budget guard needed — endpoint scopes by userId). But reading `serverApiFetch(null, '/budgets/[id]/home-summary')` without `X-Budget-ID` is a bug — the route depends on the header for RLS GUC.

**How to avoid:** Always pass `budgetId` as the first arg to `serverApiFetch` when the path is per-budget. Plan-checker enforces this via grep: `serverApiFetch\(null,\s*['"]\/budgets\/[^/]+\/` should return zero hits.

**Warning signs:** Integration test for tenant-leak passes for `/active` but fails for `/home-summary` due to wrong header.

### Pitfall 5: `<Link>` inside `<Link>` (whole-card vs in-card actions)

**What goes wrong:** Browsers refuse to nest `<a>` inside `<a>`; React warns; clicks behave unpredictably.

**Why it happens:** UI-SPEC says whole card is `<Link>` to spendings. If a future iteration adds an in-card affordance (e.g., a "manage" button) using `<Link>` too, it nests.

**How to avoid:** Whole-card link uses `<Link>` once. Any in-card click target uses `<button onClick>` with `e.stopPropagation()` + manual `router.push`. Phase 3 ships card-as-link only — no in-card actions yet (HOME provisional layout). Plan-checker greps for `<Link.*<Link` inside `budget-card.tsx`.

### Pitfall 6: FX provider stale rate returns 409 mid-render

**What goes wrong:** Home page paints, one card returns 409 `FxRateStale`, error boundary shows generic error → broken card.

**Why it happens:** Phase 1 carry-forward: FX freshness gate. `home-summary` route currently has no special case.

**How to avoid:** `home-summary` route catches `FxRateStale` and either (a) returns the result with a `stale: true` flag, OR (b) renders best-effort with last-known rate + log warning. RECOMMEND (a) — card UI can render the value normally (no special UI for stale in Phase 3) while the response carries the metadata for Phase 8 telemetry. `[ASSUMED]` — verify with discuss-phase that 409 is over-strict for read-only display surfaces.

### Pitfall 7: `useTranslations` in async RSC

**What goes wrong:** `useTranslations` is a hook; async server components can't use hooks the React-y way.

**Why it happens:** Async RSCs need the server-side `getTranslations` from `next-intl/server`. Mixing the two patterns is the most common next-intl bug.

**How to avoid:** In every async RSC: `const t = await getTranslations({ locale, namespace: 'home' })`. In client components: `const t = useTranslations('home')`. `[CITED: next-intl docs — Server Components vs Client Components]`

---

## Risks / Landmines (top 5)

1. **React Query not installed; provider tree changes.** Wave 0 install + provider mount in `[locale]/layout.tsx` is a tree-wide change. RISK: breaking server-only assumption in `(app)/layout.tsx`. MITIGATION: `QueryProvider` is client component (`'use client'`); `layout.tsx` (RSC) renders `<QueryProvider>{children}</QueryProvider>` — RSC composing client component is legal Next.js pattern.

2. **`home-summary` performance with N budgets.** User with 5 budgets triggers 5 concurrent `/home-summary` calls from RSC parallel Suspense. Each does sum + wallets + FX + overspent — could be slow on cold DB. MITIGATION: ensure the SQL uses indexes on `(budget_id, date)` on transactions and `(budget_id)` on wallets. Phase 1 schema review confirms these indexes exist `[ASSUMED]` — planner verifies via `\d transactions` / `\d wallets`. If missing, add to a Wave 0 migration.

3. **playwright-bdd not installed; Wave 0 setup cost overruns Phase 3.** RISK: setting up Gherkin infrastructure (feature-loader plugin, step-defs library, page-objects scaffolding) could swallow a wave. MITIGATION: Path B fallback (raw `.spec.ts`) is acceptable for Phase 3 with explicit debt acknowledgment. Planner picks path in Plan 03-04 spike (allow 1-2 hours of setup; if exceeds, switch to Path B).

4. **Existing v1.0 `components/budgeting/*` (24 files) cause cascade compile errors after `/workspaces` page deletion.** Those files import `apps/web/src/lib/workspace-fetch.ts` and other v1.0 entities. RISK: deleting `/workspaces/page.tsx` exposes orphaned components that still compile but aren't referenced. MITIGATION: Phase 3 leaves `components/budgeting/*` UNTOUCHED — they remain orphaned but compileable. Phases 4–7 fold them in as those surfaces ship. Plan-checker greps `apps/web/src/app` for references to deleted files; ignores orphans in `components/`.

5. **`(app)/layout.tsx` rewrite breaks unrelated authenticated routes (`/settings`, `/transactions`).** RISK: removing inline nav links and adding switcher changes header height/structure → other pages misalign. MITIGATION: rewrite preserves 64px height, preserves `<SignOutButton>`, preserves `<SiteFooter>`. Manual smoke test: visit `/{locale}/settings` post-rewrite and confirm page renders without overlap. Vitest test on layout component asserts BrandMark + Switcher + SignOutButton all present.

---

## Validation Architecture

> Phase 3 explicitly invokes "Validation Architecture" per the spawn brief. The Nyquist Dimension 8 VALIDATION.md will derive from this section.

### Test Framework
| Property | Value |
|----------|-------|
| Frontend unit/component | Vitest 4 + RTL + happy-dom (already in `apps/web/package.json` devDeps) |
| Backend unit/integration | bun:test (CLAUDE.md standard) |
| E2E | Playwright (with playwright-bdd Wave 0; Path B fallback to raw `.spec.ts`) |
| Config file | `apps/web/vitest.config.*` (exists), `apps/api/bunfig.toml` (exists), `apps/web/playwright.config.*` (exists per `cross-tenant-cache.spec.ts`) |
| Quick run command | `cd apps/web && bun run test` (component) / `make test` (backend) |
| Full suite command | `make test && make test-e2e && make ci-gate` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| NAV-01 | Top nav: current budget name + icon + chevron as trigger | component | `cd apps/web && bun run test -- budget-switcher` | Wave 0 (NEW) |
| NAV-02 | Dropdown groups Personal/Shared | component | `cd apps/web && bun run test -- budget-switcher` | Wave 0 (NEW) |
| NAV-03 | `+` button aside trigger; opens `/budgets/new` | component + E2E | `cd apps/web && bun run test -- new-budget-button`; `make test-e2e -- budget-switcher` | Wave 0 (NEW) |
| NAV-04 | Click budget → `/budgets/[id]/spendings` | component + E2E | same E2E feature | Wave 0 (NEW) |
| NAV-05 | `/workspaces` page removed | E2E (404 assertion) | `make test-e2e -- legacy-workspaces-removed` | Wave 0 (NEW) |
| HOME-01 | `/` renders one card per accessible budget | component + E2E | `cd apps/web && bun run test -- home-page`; `make test-e2e -- home-cards` | Wave 0 (NEW) |
| HOME-02 | Card data: name, badge, spent, wallets value (FX), overspent | component (markup) + bun integration (data) | `cd apps/web && bun run test -- budget-card`; `make test -- budgets-home-summary` | Wave 0 (NEW) |
| HOME-03 | Card click → `/budgets/[id]/spendings` | component (Link href assertion) + E2E | same | Wave 0 (NEW) |
| HOME-04 | Placeholder chart renders below cards | component | `cd apps/web && bun run test -- placeholder-chart` | Wave 0 (NEW) |
| BDP-01 | Pill tabs sticky on scroll | E2E (scroll + getBoundingClientRect on pill row) | `make test-e2e -- bdp-tab-frame` | Wave 0 (NEW) |
| BDP-02 | Tab order + default Spendings | component (asserts pill order) + E2E (visit `/budgets/[id]` redirects to `./spendings`) | same | Wave 0 (NEW) |
| BDP-03 | Banner shows count + expand | component + bun integration + E2E | `cd apps/web && bun run test -- task-banner`; `make test -- tasks-list-pending`; `make test-e2e -- task-banner` | Wave 0 (NEW) |
| BDP-04 | Active pill yellow accent | component (asserts CSS class) | `cd apps/web && bun run test -- bdp-tabs` | Wave 0 (NEW) |
| BDP-05 | Browser back/forward respects tab routes | E2E | `make test-e2e -- bdp-tab-frame` (scenario: browser back) | Wave 0 (NEW) |

### Sampling Rate (Nyquist-style)
- **Per task commit:** `cd apps/web && bun run test` (Vitest component, < 30s)
- **Per wave merge:** `make test && cd apps/web && bun run test` (~1-2 min)
- **Phase gate:** `make test && cd apps/web && bun run test && make test-e2e && make ci-gate` (all green)

### Wave 0 Gaps

- [ ] `cd apps/web && bun add @tanstack/react-query @tanstack/react-query-devtools` — D-PH3-13 polling lib
- [ ] (Path A) `cd apps/web && bun add -D playwright-bdd` — CLAUDE.md memory `feedback_e2e_gherkin`
- [ ] `apps/web/src/components/providers/query-provider.tsx` — React Query provider mounted in `[locale]/layout.tsx`
- [ ] `apps/web/e2e/page-objects/*.ts` — Page Object pattern setup (TopNavPo, HomePo, BdpPo, SwitcherPo, TaskBannerPo)
- [ ] `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` — fresh-user fixture
- [ ] Verify `users.display_currency` column exists; if missing, decide migration vs fallback-to-budget-currency
- [ ] Verify transactions / wallets indexes on `(budget_id, date)` exist (perf for `home-summary` parallel fan-out)

### Observable conditions for completion
- All 14 Phase 3 REQ-IDs have at least one automated test (component or E2E)
- `make ci-gate` reports 6/6 + 2 new tenant-leak tests for `home-summary` and `tasks` routes (total 8/8 green)
- Manual smoke per CLAUDE.md memory `feedback_docker_always_on`: `make dev-build && make restart-web && make restart-api`, then open `http://localhost:3000` (or `APP_URL`), confirm: log in → land on `/`, see cards, click switcher, swap budget, tabs work, browser back works, expanded banner can render (with seeded synthetic task)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth session check (existing) in `(app)/layout.tsx` |
| V3 Session Management | yes | Better Auth cookies; layout catches stale token → redirect `/sign-in?reason=session_expired` |
| V4 Access Control | yes | Postgres RLS + `app.current_user_id` GUC + `X-Budget-ID` tenant guard middleware (Phase 1+2) |
| V5 Input Validation | yes | `zValidator` on Hono routes for `?status=pending`; no body params on Phase 3 read routes |
| V6 Cryptography | n/a | Phase 3 ships no new secrets or crypto primitives |

### Known Threat Patterns for {Next.js App Router + Hono + RLS}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak via missing `X-Budget-ID` | Information Disclosure | Tenant-guard middleware enforces header; new routes added to leak fixture |
| Session hijack via cookie reuse | Spoofing | Better Auth cookie scoping (HttpOnly, SameSite=Lax); existing |
| Markup injection via budget name in switcher | Tampering | React auto-escapes JSX text; Phase 3 never renders user-supplied strings as raw markup; server validates `name.max(100)` |
| Open redirect on `/budgets/new` placeholder back-link | Tampering | Use `<Link href="/{locale}">` (string literal, no user input) |
| CSRF on poll request | Spoofing | Read-only GET; SameSite cookies; no body params |
| Sensitive data caching by Next.js | Information Disclosure | RSC uses `cache: 'no-store'` in `serverApiFetch` (existing default per `apps/web/src/lib/budget-fetch.server.ts:28`) |

**No new threat surfaces introduced.** Phase 3 inherits Phase 1 + 2's security posture and adds 2 read-only endpoints behind the same tenant guard.

---

## Code Examples

Verified patterns from current codebase + recommended adaptations.

### Example 1: RSC fetch with cookie + tenant header (existing pattern)

```ts
// /home/claude/budget/apps/web/src/lib/budget-fetch.server.ts (verbatim, verified)
export async function serverApiFetch(
  budgetId: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join("; ");
  const headers = new Headers(init.headers);
  if (cookieHeader && !headers.has("Cookie")) headers.set("Cookie", cookieHeader);
  if (budgetId && !headers.has("X-Budget-ID")) headers.set("X-Budget-ID", budgetId);
  return fetch(`${SERVER_API_BASE}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}
```
Use unchanged. Phase 3 calls it for `/budgets/active`, `/budgets/:id/home-summary`, `/budgets/:id/tasks?status=pending`.

### Example 2: Hono route with zValidator (existing pattern)

```ts
// /home/claude/budget/apps/api/src/routes/budgets.ts — pattern lines 53-81, verified
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

r.get("/:id/home-summary", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const budgetId = c.req.param("id");
  const tenantId = budgetId; // v1.1: budget_id === tenant_id (Phase 1 convention)
  const userId = session.user.id;

  // Application service composing existing repos + new home-summary service
  const summary = await getBudgetHomeSummary(
    {
      transactionRepo: deps.budgeting.transactionRepo,
      walletRepo: deps.budgeting.walletRepo,
      fxProvider: deps.budgeting.fxProvider,
      categoryLimitRepo: deps.budgeting.categoryLimitRepo,
      reserveBalanceRepo: deps.budgeting.reserveBalanceRepo,
      userRepo: deps.identity.userRepo,
    },
    { budgetId, tenantId, userId, asOf: new Date() },
  );

  return c.json(summary);
});
```

### Example 3: Async RSC consuming budgets list (mirrors existing workspaces page, adapted to home)

```tsx
// apps/web/src/app/[locale]/(app)/page.tsx — NEW (pattern adapted from
// /home/claude/budget/apps/web/src/app/[locale]/(app)/workspaces/page.tsx:19-25 verbatim fetch)
async function fetchMyBudgets(): Promise<BudgetSummary[]> {
  const res = await serverApiFetch(null, "/budgets/active");
  if (!res.ok) return [];
  const body = (await res.json()) as { workspaces?: BudgetSummary[]; budgets?: BudgetSummary[] };
  // Tolerate either response key during the transition; prefer `budgets`
  return body.budgets ?? body.workspaces ?? [];
}
```

### Example 4: Pill `Tabs` variant via CVA

```tsx
// apps/web/src/components/ui/tabs.tsx — EXTEND (current file is underline-only)
import { cva, type VariantProps } from 'class-variance-authority';

const tabsListVariants = cva(
  'inline-flex items-center',
  {
    variants: {
      variant: {
        underline: 'gap-1 border-b border-[var(--border)]',
        pill: 'gap-2',
      },
    },
    defaultVariants: { variant: 'underline' },
  },
);

const tabsTriggerVariants = cva(
  'relative inline-flex cursor-pointer items-center whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]',
  {
    variants: {
      variant: {
        underline: [
          'px-4 py-3 text-sm font-semibold leading-none',
          'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
          'data-[state=active]:text-[var(--foreground)]',
          'data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0',
          'data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px]',
          'data-[state=active]:after:bg-[var(--primary)]',
        ],
        pill: [
          'h-9 px-4 rounded-full text-sm',
          'text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)]',
          'data-[state=active]:bg-[var(--primary)] data-[state=active]:text-[var(--on-primary)] data-[state=active]:font-semibold',
        ],
      },
    },
    defaultVariants: { variant: 'underline' },
  },
);
```

NOTE: BDP tabs do NOT use Radix `Tabs.Root` (D-PH3-04 — route-as-tab). The pill variant on the primitive exists for OTHER surfaces (e.g., future filter chips). BDP-specific styling lives in `bdp-tabs.tsx` and copies the pill visual contract — see Pattern 2 above.

---

## State of the Art (training-checkpoint awareness)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router (`pages/`) | App Router (`app/`) | Next 13.4 (2023) → mature in 15 | Phase 3 fully App Router |
| `getServerSideProps` | Async Server Components | Same | RSC `serverApiFetch` |
| `useRouter` from `next/router` | `useRouter` from `next/navigation` | App Router | Phase 3 uses `next/navigation` |
| `Image` `layout` prop | `Image` `fill` + `width/height` | Next 13.0 | n/a Phase 3 (no images) |
| Radix `Tabs` for tab-shaped UX | Route-as-tab via `<Link>` + `usePathname` | App Router idiom | D-PH3-04 |
| `swr` for client polling | `@tanstack/react-query` v5 | 2023+ ecosystem shift | D-PH3-13 chooses React Query |

**Deprecated / not used in Phase 3:**
- `next/router` — replaced by `next/navigation`
- `getServerSideProps` — replaced by async RSC
- `next/head` — replaced by metadata API
- Radix `Tabs.Trigger` state for tabs that should be deep-linkable

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@tanstack/react-query` latest stable is v5.x | Standard Stack | LOW — npm install resolves; Wave 0 confirms |
| A2 | `users.display_currency` column exists on the users table after Phase 1 migration | Currency Conversion Boundary | MEDIUM — if missing, Phase 3 ships either a migration or a fallback (use budget's default_currency). Spike in Wave 0 |
| A3 | FX freshness gate (409) on read-only display surfaces should degrade gracefully (return data + `stale: true` flag) rather than 409 | Pitfall 6 + Data Contract §2 | MEDIUM — if not, every stale rate breaks the home page. discuss-phase should confirm |
| A4 | playwright-bdd is the chosen E2E path (Path A) | Test Strategy | LOW — Path B fallback acceptable; plan-phase picks |
| A5 | `transactions(budget_id, date)` and `wallets(budget_id)` indexes exist | Risks §2 | MEDIUM — `home-summary` perf depends on them. Wave 0 `\d` check |
| A6 | The `tasks` table created in Phase 1 has columns `(id, tenant_id, budget_id, kind, payload_json, status, created_at, resolved_at)` per MIG-08 | Data Contract §3 | LOW — verify against `apps/api/test/routes/` Phase 1 test or `\d tasks` |
| A7 | Existing `(app)/layout.tsx` header uses `z-40`; Phase 3 needs to bump it to `z-50` to ensure switcher Popover doesn't render under BDP sticky | Sticky pill section + `(app)/layout.tsx` rewrite | LOW — visually verifiable |
| A8 | Phase 4 will need the same React Query client; installing it in Phase 3 is the natural place | Standard Stack | LOW — even if Phase 4 chooses differently, R-Q is the more general-purpose choice |

**Total assumed claims:** 8. All are LOW-MEDIUM risk and resolvable in Wave 0 spikes or by discuss-phase clarification before locking the plans.

---

## Open Questions

1. **Should `/budgets/active` rename its response key from `workspaces` to `budgets`?**
   - What we know: legacy from v1.0; Phase 1 D-08 already aligned URLs but not response shapes.
   - What's unclear: Whether the planner should bundle this rename into Phase 3 (small additive change) or defer to Phase 8 i18n/IA hardening.
   - Recommendation: bundle into Phase 3, document as ENGR-shaped fix in plan. One-line backend change + web side already supports either key via the tolerant fetch (`body.budgets ?? body.workspaces`).

2. **Does the FX provider currently degrade gracefully on stale rates, or strictly 409?**
   - What we know: Phase 1 carry-forward says "FX freshness gate (60-min server-side threshold; 409 FxRateStale with freshRate payload)".
   - What's unclear: applied uniformly to all routes including display-only surfaces, or only to mutation routes (transaction create).
   - Recommendation: Plan 03-02 spike: read `apps/api/src/routes/fx.ts` + `recurring-engine-fx.ts` for current pattern. If 409-everywhere, add a `?graceful=true` query flag to `home-summary` that returns data + stale flag instead.

3. **`users.display_currency` source: column or computed?**
   - What we know: Phase 1 schema renamed/added several columns.
   - What's unclear: whether display_currency was added or is computed from locale.
   - Recommendation: Plan 03-01 (Wave 0) runs `\d users` against dev DB. If missing, decision tree:
     - (a) Add `users.display_currency CHAR(3) NULL` in a tiny Phase 3 migration with `users.display_currency` ← `users.locale` mapping default (PL→PLN, UK→UAH, EN→USD).
     - (b) Fall back per-call: if NULL or absent, use budget's `default_currency`. Lazier but acceptable.
   - User can pick at plan-checker time.

4. **playwright-bdd setup vs raw `.spec.ts`?**
   - What we know: CLAUDE.md memory says Gherkin via playwright-bdd. Existing E2E is raw `.spec.ts`.
   - What's unclear: whether Phase 3 takes the cost of installing playwright-bdd or defers.
   - Recommendation: Path A. Setup cost (~1-2 hours) is small relative to test value across Phases 4–8. Plan 03-04 owns the setup.

5. **Single tasks endpoint location: `apps/api/src/routes/budgets.ts` extension or new `tasks.ts`?**
   - What we know: Phase 7 will own tasks writes.
   - What's unclear: Phase 3 read could go either place.
   - Recommendation: separate `apps/api/src/routes/tasks.ts` file mounted under `/budgets/:budgetId/tasks`. Cleaner blast radius; Phase 7 just adds POST/PATCH to the same file.

---

## Environment Availability

> Phase 3 depends on existing Docker compose stack (postgres + api + web) and Bun runtime. No new external services.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun 1.2.x | All TS/JS execution | `[ASSUMED YES]` (CLAUDE.md mandates) | TBD | — |
| Docker | Local dev + tests | `[ASSUMED YES]` (CLAUDE.md MEMORY `feedback_docker_always_on`) | — | — |
| PostgreSQL 15+ (Phase 1) | API routes + integration tests | `[ASSUMED YES]` (Phase 1 ran migrations) | 15+ | — |
| Better Auth | Session validation | `[ASSUMED YES]` (Phase 1+2 use) | latest | — |
| Frankfurter (FX provider) | `home-summary` FX conversion | `[ASSUMED YES]` (Phase 2 ships `FrankfurterFxProvider`) | n/a | FX freshness gate already handles outages |
| Resend (email) | Not used in Phase 3 | n/a | — | — |
| pg-boss | Not used in Phase 3 (Phase 7 owns) | n/a | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `@tanstack/react-query` — not yet installed in `apps/web/package.json`. Wave 0 installs it. No fallback acceptable (D-PH3-13 locks the choice).

---

## Project Constraints (from CLAUDE.md)

Directives that constrain Phase 3 planning (extract from `/home/claude/budget/CLAUDE.md` + user MEMORY).

**Tech stack:**
- TypeScript on Bun (runtime), Next.js (App Router) for FE, Hono v4.12+ for API
- Drizzle ORM ONLY in `src/<context>/adapters/persistence/` — domain stays pure
- Money value object (Dinero v2) at adapter boundary — never inside domain
- `Money` converts to `{ amount_cents BIGINT, currency CHAR(3) }` at adapter boundary
- Zod v3 for validation
- next-intl for i18n (EN, PL, UK)
- Bun:test for backend; Vitest 4 + happy-dom + RTL for frontend; Playwright for E2E
- pg-boss v10 (jobs) — not used in Phase 3

**Forbidden:**
- Lucia (deprecated) · next-pwa (unmaintained) · Prisma · NestJS · Yup/Joi/io-ts · moment/dayjs · Express · iron-session · Auth0/Clerk · Float for money · GraphQL for internal API

**Testing (TDD-first MANDATORY):**
- Write failing test BEFORE implementation. No exceptions.
- Bug reports imply missing tests — failing reproducer first.
- Claude runs `make test` / `make test-e2e` before asking user to click anything.
- No DB mocking in integration tests — real Postgres.
- E2E covers golden path + main error cases for every user-facing flow.
- BDD naming: `describe('Sign Up') > test('creates account and shows verification banner')`.
- Playwright base URL from `PLAYWRIGHT_BASE_URL` env (CLAUDE.md MEMORY `feedback_test_baseurl`).
- 80% domain coverage in `bunfig.toml` — don't lower.
- Every API route gets ≥1 integration test in `apps/api/test/routes/`.
- E2E uses Gherkin (playwright-bdd) + Page Objects + fresh-user-per-scenario fixture (CLAUDE.md MEMORY `feedback_e2e_gherkin`).

**GSD Workflow:**
- Before Edit/Write: start through a GSD command (Phase 3 uses `/gsd-plan-phase` → `/gsd-execute-phase`).
- No direct repo edits outside GSD workflow.

**Local dev (CLAUDE.md MEMORY `feedback_docker_always_on`):**
- Before reporting phase verified: spin up Docker, run `make test + make ci-gate`. Never accept "infra unavailable" as skip.
- `web` and `api` images are prebuilt — rebuild with `make dev-build` + `make restart-web` / `make restart-api` after edits to `apps/web/**`, `apps/api/**`, `packages/**`. Use `make restart-<service>` (wraps in `infisical run`).
- i18n JSON edits → rebuild `web` (bundled at build time).

**Authority hierarchy for Phase 3 planning:**
1. CLAUDE.md (this section) — locked directives
2. CONTEXT.md D-PH3-01..22 — phase-locked decisions
3. UI-SPEC.md — visual contract (approved)
4. DESIGN.md (in repo root) — design token source of truth

---

## Sources

### Primary (HIGH confidence)
- `/home/claude/budget/.planning/phases/03-navigation-home-bdp-frame/03-CONTEXT.md` — 22 D-PH3 decisions, locked
- `/home/claude/budget/.planning/phases/03-navigation-home-bdp-frame/03-UI-SPEC.md` — 694-line approved visual contract
- `/home/claude/budget/.planning/REQUIREMENTS.md` — 14 REQ-IDs (NAV-01..05, HOME-01..04, BDP-01..05)
- `/home/claude/budget/.planning/ROADMAP.md` — Phase 3 success criteria
- `/home/claude/budget/CLAUDE.md` — tech stack, testing rules, forbidden libs
- `/home/claude/budget/apps/web/package.json` — Next 15.3.2, React 19, Radix primitives present; React Query MISSING
- `/home/claude/budget/apps/web/src/components/ui/{tabs,popover,dropdown-menu}.tsx` — primitives source
- `/home/claude/budget/apps/web/src/app/[locale]/(app)/layout.tsx` — existing top-nav (REWRITE target)
- `/home/claude/budget/apps/web/src/components/workspace/workspace-switcher.tsx` — v1.0 Sheet-based switcher (DELETE)
- `/home/claude/budget/apps/web/src/components/workspace/workspace-sidebar.tsx` — v1.0 sidebar (DELETE)
- `/home/claude/budget/apps/web/src/app/[locale]/(app)/workspaces/page.tsx` — v1.0 list page (DELETE)
- `/home/claude/budget/apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx` — v1.0 sidebar layout (DELETE)
- `/home/claude/budget/apps/api/src/routes/budgets.ts` — existing `/budgets/active` endpoint (line 331-338); EXTEND for `home-summary`
- `/home/claude/budget/apps/web/src/lib/budget-fetch.server.ts` — RSC fetch helper (REUSE verbatim)
- `/home/claude/budget/apps/web/src/lib/budget-fetch.ts` — client fetch helper (REUSE)
- `/home/claude/budget/apps/web/src/lib/api-client.ts` — Hono RPC client (REUSE; types flow automatically)
- `/home/claude/budget/packages/tenancy/src/ports/budget-repo.ts` — `listForUser` already defined
- `/home/claude/budget/packages/tenancy/src/adapters/persistence/workspace-repo.ts` line 57 — implementation
- `/home/claude/budget/packages/budgeting/src/adapters/fx/frankfurter.ts` — existing FX adapter (REUSE)
- `/home/claude/budget/packages/shared-kernel/src/ports/fx-provider.ts` — port for `home-summary`
- `/home/claude/budget/apps/web/messages/{en,pl,uk}.json` — i18n catalogs (EXTEND with nav.*, home.*, bdp.*)
- `/home/claude/budget/graphify-out/GRAPH_REPORT.md` — community map (consulted; no direct claims drawn)

### Secondary (MEDIUM confidence)
- Next.js 15 App Router docs (mental model) — RSC + Suspense streaming patterns, `redirect()`, nested layouts, `usePathname` `[CITED: react.dev/Next.js docs as referenced in training]`
- next-intl docs — `getTranslations` (server) vs `useTranslations` (client) split `[CITED]`
- Radix UI docs — Popover collision handling, Tabs primitive, Tooltip a11y conventions `[CITED]`
- `@tanstack/react-query` v5 docs — `refetchInterval` + `refetchIntervalInBackground` semantics `[CITED]`

### Tertiary (LOW confidence — needs verification)
- Exact `users.display_currency` column existence (A2) — Wave 0 verifies
- FX `409 FxRateStale` behavior on read-only display surfaces (A3) — Wave 0 verifies
- Transactions / wallets index presence (A5) — Wave 0 verifies

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every primitive verified present in `apps/web/package.json` and `components/ui/`; React Query is the single new install (locked by D-PH3-13)
- Architecture: HIGH — every pattern maps to a locked decision (D-PH3-01..22) and a current Next.js App Router idiom; route-as-tab via `<Link>` + `usePathname` is the canonical post-Pages-Router pattern
- File map (delete/rewrite/create): HIGH — verified by direct ls of the actual paths; no speculation
- Data contracts: MEDIUM — `home-summary` and `tasks?status=pending` payload shapes are derived from CONTEXT D-PH3-11 + D-PH3-13 + REQ-IDs and UI-SPEC §6 banner row; backend doesn't ship them yet so signatures are proposals locked by THIS research
- Pitfalls: HIGH — all 7 pitfalls drawn from real Next.js App Router gotchas + project-specific patterns observed in codebase (cookie forwarding, hexagonal boundaries)
- Test strategy: HIGH — maps each REQ to a concrete file + command; gaps explicit (playwright-bdd install, query provider)

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 (30 days for stable App Router patterns; Phase 3 should execute well within that window)
