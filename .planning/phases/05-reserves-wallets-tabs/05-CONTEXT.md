# Phase 5: Reserves & Wallets Tabs - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the two remaining BDP tabs that share data-table primitives:

- **Reserves tab** — data table surfacing per-category reserve balance (from the rewritten `category_reserve_balance` VIEW, which now folds in manual adjustments) plus a derived "Reserve wallet share" column. **Reserve balance cell is click-to-edit**: edits write to a new `category_reserve_adjustments` table. Two sections: **Active** and **Excluded** — drag a row between them to opt-in/opt-out of reserve math. Excluded categories retain their balances frozen + hidden from totals. Mismatch row (sticky bottom) reconciles `Σ wallets vs Σ expected`. Actions column for top-up/withdraw tasks lands in Phase 7.
- **Wallets tab** — grouped, editable list of wallets. **Three sections** (Spendings / Cushion / Reserve), each with always-inline editable rows (Name · Currency · Amount) and a per-section dashed `+ Add wallet` button at the bottom (visual rhyme with Phase 4's `+ category` dashed column). Drag-and-drop between sections changes a wallet's type. Hover (desktop) / tap (mobile) row reveals trash. Click any cell → cell becomes editable; blur saves. **Currency cell is editable** (WALT-04 rescinded for Phase 5); server validates RESERVE-type wallets stay in budget currency.

**In scope:** Reserves data endpoint, share math, inline-edit reserve balance with adjustments ledger, 2-section Reserves layout (Active/Excluded) with drag-between, mismatch totals row (sticky bottom, both viewports), global reserves-enabled column (UI toggle in Phase 6), 3-section Wallets layout, per-row drag-between-sections, inline cell edit + autosave, soft-archive delete, dashed `+ Add wallet` button per section, mobile parity.

**Out of scope (deferred to later phases):**

- Phase 7: Reserves tab Actions column (top-up / withdraw task surface), reserve-mismatch task generation, mismatch banner UI, per-category mismatch task generation
- Phase 6: Settings tab — owns the visible toggle UI for `budgets.reserves_enabled` (Phase 5 ships the column + cascading UI behavior only)
- Multi-currency reserve-type wallets — explicitly **rejected** in this phase (server validation enforces reserve-type wallets MUST equal budget currency, even after WALT-04 relaxation for non-reserve wallets)
- Explicit transfer modal / atomic A→B paired adjustments — deferred. Transfers happen via two independent inline edits; the mismatch bucket reflects the in-flight delta as visible truth.

</domain>

<decisions>
## Implementation Decisions

### Wallets tab layout — 3 grouped sections (NOT a Type column in rows)

- **D-PH5-W1:** Wallets render as **three vertically-stacked sections**: Spendings → Cushion → Reserve (fixed order). Each section has a section header (translated label) and its own list of wallet rows. **`Type` is the section, not a row cell** — rows only show Name / Currency / Amount. This is a deliberate departure from the original WALT-01 reading ("one row per wallet with Type cell"); intent of WALT-01/02 (visibility + editability of type) preserved by making type the grouping axis.
- **D-PH5-W2:** Each section ends with a **transparent button with dashed border** styled identically to Phase 4's `+ Add category` dashed column (same DESIGN.md tokens, same hover treatment). Clicking spawns a new wallet row inline at the bottom of that section with focus on Name. The dashed `+ Add` button moves below the new row after creation (always the last item).
- **D-PH5-W3:** **Empty sections still render** their section header + the dashed `+ Add wallet` button. No helper copy ("No reserve wallets yet" etc.) — the dashed button is self-explanatory and matches Phase 4 minimal-state convention.

### Wallets cell-interaction model — deliberate softening of Phase 4 universal no-hover rule

- **D-PH5-W4 (interaction model):** Wallets are **form-like rows**, NOT data-grid rows. Therefore, the Phase 4 universal model (`D-PH4-INT1: no hover behavior anywhere in the grid; single-click reveals options`) does NOT apply to Wallets. Reasoning: wallet rows are sparse (≤ ~10–20 per family) and edited rarely but directly (no inline-action confusion); spendings grid is dense and benefits from click-to-reveal discipline.
- **D-PH5-W5 (desktop):**
  - At rest: row renders as plain text (Name / Currency / Amount).
  - **Hover on row** → row gets a highlight background (DESIGN.md surface-elevated token) AND a trash icon appears on the right side of the row.
  - **Click any cell** → that cell becomes editable in place (input for Name, select for Currency, numeric input for Amount). Row enters "edit state" visually.
  - **Blur** (click outside, Tab to next cell, or row loses focus) → saves the cell via PATCH /wallets/:id with optimistic update + toast confirmation.
  - **Tab key** moves focus across cells in row order (Name → Currency → Amount → next row's Name). No `Type` cell in tab order (type is the section).
- **D-PH5-W6 (mobile):**
  - At rest: same plain-text rendering.
  - **First tap on row** → row highlights + trash icon appears (selected state).
  - **Second tap on same cell** (or **double-tap** on a cell directly): cell becomes editable.
  - **Tap outside or scroll** → blur saves.
  - Both "single-tap-then-tap-cell" AND "double-tap-cell" paths are valid entry points to inline edit (per user spec).
- **D-PH5-W7 (drag-to-move-between-sections):** Each wallet row has a **drag handle on the left side** (reuse Phase 4 `<RowDragHandle>` lucide `GripVertical` pattern). Long-press (mobile) / mouse-drag (desktop) grabs the row; drop into another section's drop zone changes the wallet's type and persists via PATCH /wallets/:id `{type: NEW_TYPE}`. Drag within the same section can ALSO reorder if cheap — defer to planning whether to support in-section reorder this phase (not required by WALT-\* but visually expected once drag exists).
- **D-PH5-W8 (Reserve-section drag validation):** Dropping a non-budget-currency wallet into the Reserve section MUST be rejected by the server (per D-PH5-R3 below) and shown to the user as an inline error (toast: "Reserve wallets must be in budget currency {CCY}"). Row snaps back to its original section optimistically on error.

### Reserves tab data shape + share math

- **D-PH5-R1:** **New endpoint `GET /budgets/:id/reserves`** — server pre-computes everything for the tab:
  ```
  {
    rows: [{ categoryId, name, reserveBalance, walletSharePercent, walletShareAmount }],
    totals: { totalCategoryReserves, totalReserveWalletAmount, mismatch }
  }
  ```
  All currency in budget currency, integer cents. Computed in one round trip; same endpoint will be consumed by Phase 7's reserve-topup task generator (single source of truth for mismatch math).
- **D-PH5-R2 (share math):** `walletSharePercent(c) = (reserveBalance(c) / Σ reserveBalance) × 100`; `walletShareAmount(c) = walletSharePercent(c) × Σ(reserve-type-wallet amounts) / 100`. Both computed server-side from `category_reserve_balance` VIEW + the wallets table.
- **D-PH5-R3 (currency constraint — IMPORTANT):** **Reserve-type wallets MUST be in the budget's default currency.** Server validation enforces this on (a) wallet create, (b) wallet edit (currency change), (c) wallet type change to RESERVE. Rationale: keeps share-math FX-free, prevents drift from FX rate snapshots, simplest accurate mismatch math. Spendings-type and Cushion-type wallets retain free-currency choice.
- **D-PH5-R4 (edge cases):**
  - `Σ reserveBalance == 0` (new budget, no past months) → entire share column renders as `—` (em dash).
  - `Σ reserve-type-wallets == 0` (no reserve wallets exist) → entire share column renders as `—`.
  - New category with zero history → its row renders reserve balance 0.00 (number, not dash) and share `—` (dash). Per RSRV-07.
- **D-PH5-R5 (mismatch surfacing — this phase):** **No banner, no task, no warning.** Mismatch is implicit — user can compare the totals row themselves (footer row shows `Σ category reserves` and `Σ reserve wallets`). Phase 7 owns the explicit task generation + banner. This phase ships the totals row + correct math only.
- **D-PH5-R6 (Actions column placeholder):** Actions column renders with a muted disabled-looking ellipsis/icon placeholder (`—` or muted lucide `MoreHorizontal`) on each row. Header label translated as "Actions" via i18n key. Inert this phase (per ROADMAP success-criterion #5); Phase 7 will wire it to the task model.
- **D-PH5-R7 (manual rebalance via inline-edit):** Reserve balance cell is **click-to-edit** (same UX as Wallets cells). On blur: client computes `delta = newValue − (autoCompute + Σ priorAdjustments)` and POSTs `/budgets/:id/reserves/:categoryId/adjust` with `{ delta_cents, note? }`. Server appends one row to `category_reserve_adjustments`. Effective balance = `autoCompute + Σ adjustments`. No transfer modal — transfer between categories = two independent inline edits (decrement A, increment B); the mismatch bucket reflects the in-flight delta as visible truth.
- **D-PH5-R8 (adjustments table schema):**
  ```
  category_reserve_adjustments (
    id          uuid pk,
    tenant_id   uuid not null,
    category_id uuid not null references categories(id),
    delta_cents bigint not null,            -- signed; negative = withdraw
    note        text,
    created_by  uuid references users(id),
    occurred_at timestamptz not null default now()
  )
  ```
  Append-only (no UPDATE, no DELETE). RLS policy mirrors `categories` table tenant gate. Index `(tenant_id, category_id, occurred_at)`.
- **D-PH5-R9 (VIEW rewrite):** Existing Phase 2 `category_reserve_balance` VIEW is reissued so `reserve_balance = autoCompute + COALESCE(SUM adjustments WHERE category_id = c.id, 0)`. Excluded categories return `0` from the VIEW and are excluded from every `Σ` (totals, share denominator, mismatch). Migration: drop + recreate VIEW.
- **D-PH5-R10 (Reserves tab Active/Excluded sections):** New column `categories.reserve_excluded boolean not null default false`. Reserves tab renders TWO sections: **Active** (top, normal styling, full math) and **Excluded** (bottom, grayed-out styling, balance frozen, NOT in totals / share / mismatch). Drag between sections (reuses Wallets drag primitive) toggles `reserve_excluded`. Excluded categories retain accumulated adjustments + auto-compute history; restoring to Active resurrects the previous balance unchanged. No section is collapsible this phase. Inline-edit of balance is **disabled** for Excluded rows (visually grayed cell, no click handler).
- **D-PH5-R11 (global reserves toggle):** New column `budgets.reserves_enabled boolean not null default true`. When `false`:
  - Reserves tab pill **hidden** from BDP tab navigation (Phase 3 tab list reads this flag).
  - Spendings grid reserve row (row 4 from Phase 4) **hidden**.
  - Top reserve pill on Home / BDP shell **hidden**.
  - `category_reserve_balance` VIEW still computes (no app-side branching), but no UI consumes it.
  - Toggle UI lives in **Phase 6 Settings**; Phase 5 ships only the column + the cascading-hide behavior. Default value `true` preserves current UX.
- **D-PH5-R12 (mismatch row UX):** Sticky-bottom row on both desktop and mobile (same scroll container as table body). Shape:
  - `Σ category reserves (expected)` · `Σ reserve wallets` · **mismatch chip** with direction word + amount.
  - When `Σ wallets > Σ expected` → chip "**+€X overfunded** — reduce reserve wallet or distribute to categories" (warning tone, NOT error).
  - When `Σ wallets < Σ expected` → chip "**−€X underfunded** — top up reserve wallet or reduce category reserves" (warning tone).
  - When equal → chip "**Reconciled**" (muted/success token).
  - Mismatch is global only this phase (no per-category over/under indicator beyond what derives from the share column showing each category's allocation vs expected). Per-category mismatch task surface lands Phase 7.
- **D-PH5-R13 (transfer mechanic):** No transfer modal. User rebalances by editing two Reserve balance cells in sequence. The mismatch bucket absorbs the delta between the two edits — that's the feature signaling "you're mid-rebalance". Closing the tab mid-transfer is safe; the partial state is persisted (one adjustment row) and visible via the mismatch chip on next load.

### Wallet defaults + delete semantics

- **D-PH5-W9 (Add defaults):** When `+ Add wallet` is clicked in a section:
  - `type` = section (Spendings | Cushion | Reserve) — locked, not user-selectable in the inline row (drag to move after creation)
  - `currency` = budget default currency (and for Reserve section, this is the ONLY allowed currency per D-PH5-R3 — currency cell is read-only in that case)
  - `amount` = 0
  - `name` = empty, cursor focused, placeholder "Wallet name"
  - Creation is **optimistic** (POST /wallets fires on Name blur with non-empty value; row stays in DOM even before server confirms). On server error, row reverts + toast.
- **D-PH5-W10 (Delete):** **Soft-archive with NO restore UI.** Existing `POST /wallets/:id/archive` is the backend touchpoint. Archived wallets are hidden from the wallets tab and from reserves-share math immediately. Recovery is admin/DB-only this phase. Confirmation dialog text: "Delete wallet '{name}'? This can't be undone here." (literally accurate — no in-app restore).
- **D-PH5-W11 (Delete cascade):** Deleting a wallet does NOT affect transactions (per WALT-07 wallet balances are manual snapshots; no ledger link). Reserves tab share math immediately recomputes (one less reserve-type wallet) on next refetch.
- **D-PH5-W12 (Currency cell editable — WALT-04 rescinded):** Per Open-Q1 resolution, **WALT-04 immutability is rescinded for Phase 5**. Currency cell becomes inline-editable like Name and Amount. Domain layer: `Wallet.changeCurrency(newCurrency)` allowed; `setBalance()` no longer fails on currency mismatch (currency is a separate field, amount stays numerically the same — no FX conversion on the cell edit). For RESERVE-type wallets the server still rejects changing currency away from the budget's default (D-PH5-R3); UI shows 422 toast + snap-back. For non-reserve wallets, currency edit is unconstrained.

### Engineering discipline

- **D-PH5-E1 (data-fetching primitive):** Reuse **TanStack Query** (Phase 4's choice — already in deps). One query key per tab: `["budget", id, "reserves"]` and `["budget", id, "wallets"]`. Mutations: PATCH /wallets/:id, POST /wallets, POST /wallets/:id/archive, PATCH /wallets/:id (type change via drag-drop). Optimistic update + invalidate on settled; cross-invalidate `reserves` query whenever a reserve-type wallet mutates (or any wallet's type changes to/from Reserve).
- **D-PH5-E2 (RSC + client island split):** Same shape as Phase 3 + 4:
  - `reserves/page.tsx` (RSC) — fetches initial `/budgets/:id/reserves` payload, renders `<ReservesTableClient initial={...} />`.
  - `wallets/page.tsx` (RSC) — fetches initial `/wallets` list, renders `<WalletsClient initial={...} />`.
  - Client islands own all interactivity (inline edit state, drag-drop, optimistic mutation queue).
- **D-PH5-E3 (drag-drop library):** Reuse Phase 4's drag-drop primitive — **@dnd-kit** (already in dep tree from Phase 4 category drag-reorder). Build a cross-section DnD context; sections are drop zones; rows are draggables.
- **D-PH5-E4 (i18n):** All new strings get i18n keys in EN + PL + UK. Reuse Phase 3+4 namespacing convention (`budget.reserves.*`, `budget.wallets.*`).
- **D-PH5-E5 (testing):** Backend integration tests for new `/budgets/:id/reserves` endpoint (zero categories, zero reserve wallets, multi-tenant gate, currency-mismatch rejection on wallet currency change). Vitest component tests for inline-edit + drag-drop behavior. E2E (`tests/e2e/`) for: add wallet → edit amount → move to Reserve section → view on Reserves tab → delete. Bun + Postgres real DB (no mocks per CLAUDE.md TDD rules).
- **D-PH5-E6 (DESIGN.md adherence):** All new components use DESIGN.md tokens (Binance dark canvas, yellow only for primary actions — `+ Add wallet` dashed button is NOT yellow per Phase 3+4 precedent; trash icon uses destructive token; row hover uses surface-elevated). Run impeccable sweep before phase close per CLAUDE.md.

### Claude's Discretion

- **Layout primitive sharing** — Reserves and Wallets diverged enough that a shared `<DataTable>` parent component would be over-abstraction. Build separate components (`<ReservesTable>`, `<WalletsSectionedList>`) and reuse small shared atoms: `<RowDragHandle>` (already exists from Phase 4 categories), `<InlineEditCell>` (new, see below), `<DashedAddButton>` (new, generalizes Phase 4 `+ category` dashed column), `<TableRowHover>` (DESIGN.md token application). Atoms live in `apps/web/src/components/ui/` or `apps/web/src/components/budgeting/`.
- **`<InlineEditCell>` primitive** — new atom that wraps `<input>` / `<select>`, handles the click-to-edit + blur-to-save lifecycle, surfaces optimistic save state (spinner / error icon) and toast trigger. Will likely be reused in Phase 6 Settings (budget name edit). Don't over-design — solve Wallets' needs first; extract additional flex if Phase 6 actually needs it.
- **In-section reorder** — drag-within-section reorder is NOT required by WALT-\* but a natural UX consequence of the cross-section drag affordance. Planning agent decides: ship with manual `sort_index` (cheap, no schema change since wallets already have created_at ordering — would need a new column) OR defer to a separate ticket. Suggestion: defer; section grouping is the primary affordance.
- **Drag-drop drop-zone visuals** — section background tint on drag-over, drop-line indicator. Standard @dnd-kit patterns.
- **Mobile drag activation delay** — default @dnd-kit `PointerSensor` with `activationConstraint: { delay: 300, tolerance: 5 }` to avoid drag-on-tap. Same calibration as Phase 4 row-drag.
- **Reserves tab footer row visual** — bold or subtle? Position (sticky bottom or inline)? Pick during sketch; recommendation: sticky bottom-of-table totals row with `Σ` glyph prefix.
- **Toast lib / position** — reuse whatever Phase 4 chose for inline-edit autosave confirmations.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 5 (lines 119–133) — phase goal, dependencies, requirements list, success criteria
- `.planning/REQUIREMENTS.md` §Reserves Tab (RSRV-01…RSRV-07) — auto-compute spec, share math, isolation, edge cases
- `.planning/REQUIREMENTS.md` §Wallets Tab (WALT-01…WALT-07) — inline-edit, +Add, type semantics, manual snapshots
- `.planning/REQUIREMENTS.md` §Reserves Auto-Compute (RSCM-\*) — VIEW behavior already implemented in Phase 2

### Milestone spec

- `.planning/v1.1-SPEC.md` §4 Reserves tab (lines 95–110) — table columns, share math, reconciliation task
- `.planning/v1.1-SPEC.md` §5 Wallets tab (lines 111–125) — inline-edit row, type as single-select, no popup, no archive
- `.planning/v1.1-SPEC.md` §8 Reserves auto-compute algorithm (lines 174–190) — formula reference (Phase 2 VIEW implements)
- `.planning/v1.1-SPEC.md` §9 Tasks queue — `tasks.reserve_topup` row is Phase 7; this phase ships totals only

### Project conventions

- `/home/claude/budget/CLAUDE.md` — TDD-first, no DB mocks, hexagonal per context, Money at adapter boundary, DESIGN.md authority, impeccable sweep before close, Docker on for verification
- `.planning/PROJECT.md` §Key Decisions — Bun/Hono/Drizzle stack, RLS + tenant_id, mobile-first PWA
- `DESIGN.md` — Binance dark canvas, single yellow accent (yellow only for primary actions; +Add dashed buttons NOT yellow), Inter + IBM Plex Sans

### Phase 3 carry-forward (locked decisions still in force)

- `.planning/phases/03-navigation-home-bdp-frame/03-CONTEXT.md` §BDP tab frame — placeholders `reserves/page.tsx` + `wallets/page.tsx` already mounted in `apps/web/src/app/[locale]/(app)/budgets/[id]/`. Phase 5 fills them in.
- §BDP tab frame D-PH3-03 — lucide icons reserved: `Coins` for Reserves, `Wallet` for Wallets (mobile icon-only treatment ≤480px)
- §Implementation Decisions Routing & legacy cleanup — separate Next.js routes per tab; pills `<Link>` for SPA nav

### Phase 4 carry-forward (locked decisions still in force)

- `.planning/phases/04-spendings-grid/04-CONTEXT.md` §Reusable Assets — Sheet primitive, lucide icons, BinancePlex amount input, currency picker, Phase 2 field components in `apps/web/src/components/budgeting/fields/`
- §Implementation Decisions Drag-reorder — `<RowDragHandle>` lucide `GripVertical` + @dnd-kit. Phase 5 reuses this primitive directly.
- §Specific Ideas dashed `+` column pattern — generalize as `<DashedAddButton>` atom for Wallets `+ Add wallet` per section
- §Engineering discipline — TanStack Query for optimistic mutations + cache invalidation
- §Interaction model — Phase 5 EXPLICITLY softens `D-PH4-INT1` (no-hover rule) for Wallets only; Spendings grid keeps no-hover discipline. Documented as D-PH5-W4 above.

### Phase 2 backend touchpoints

- `apps/api/src/routes/wallets.ts` — POST / GET (list, by-id) / archive / PUT /balance already implemented. **New for Phase 5:** PATCH /wallets/:id (partial update for inline-edit of name/currency/amount/type).
- `apps/api/src/routes/budgets.ts` — current minimal `GET /budgets/:id/reserves` must be **extended** to D-PH5-R1 shape (rows + totals). **Also new:** `POST /budgets/:id/reserves/:categoryId/adjust` (manual rebalance), `PATCH /budgets/:id/categories/:categoryId/reserve-excluded` (toggle Active/Excluded section), and read paths must respect `budgets.reserves_enabled`.
- `packages/budgeting/src/adapters/persistence/wallet-repo.ts` — existing Drizzle adapter; extend with `update()` port
- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — existing reader of `category_reserve_balance` VIEW; reuse, but VIEW itself is **reissued** (D-PH5-R9) to fold in adjustments + Excluded filter
- `packages/budgeting/src/adapters/persistence/category-reserve-adjustments-repo.ts` — **NEW** (append-only writes, paginated list per category for future audit UI)
- `packages/budgeting/src/domain/wallet.ts` — domain entity; rescind `canChangeCurrency` immutability per D-PH5-W12; add `changeType`, `setAmount`, `rename` mutation methods
- `packages/budgeting/src/contracts/api.ts` — Zod schemas; add `updateWalletSchema`, `reserveAdjustmentSchema`, `categoryReserveExcludeSchema`
- **New Drizzle migration** — additive: `category_reserve_adjustments` CREATE TABLE + RLS policy + indexes; `categories.reserve_excluded` column ADD; `budgets.reserves_enabled` column ADD; `category_reserve_balance` VIEW DROP + recreate (additions + Excluded filter)

### CI gates & tests

- `make test` — bun:test backend unit + integration (new tests for /reserves endpoint, wallet PATCH, reserve-currency constraint)
- `make test-e2e` — Playwright BDD (Gherkin) for add → edit → drag → delete → reserves-share flow
- `make ci-gate` — multi-tenant leak gate; new /reserves endpoint must pass cross-tenant 404 test
- `cd apps/web && bun run test` — Vitest component tests for inline-edit + drag-drop

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`<RowDragHandle>`** (Phase 4 category drag-reorder) — lucide `GripVertical` + @dnd-kit primitive; lift to shared atom for cross-section wallet drag
- **`<DashedAddButton>` pattern** (Phase 4 `+ category` dashed column) — generalize as shared atom; Wallets uses one per section, Phase 6 Settings may reuse
- **lucide-react icons** already in deps: `Coins` (Reserves header), `Wallet` (Wallets header), `GripVertical` (drag), `Trash2` (delete), `MoreHorizontal` (Actions placeholder), `Plus` (add buttons)
- **TanStack Query** + `queryClient` (Phase 4) — reuse with new query keys; cross-invalidate `reserves` on any reserve-type wallet mutation
- **Sheet primitive** (`apps/web/src/components/ui/sheet.tsx`) — likely NOT needed this phase (no full slider; inline-edit only), but available if a wallet detail/history view is added later
- **Phase 2 field components** in `apps/web/src/components/budgeting/fields/` — currency picker + amount input reusable inside `<InlineEditCell>`
- **Toast/notification primitive** (Phase 4 autosave confirmations) — reuse exact API/positioning

### Established Patterns

- **RSC page shell + client island** — Phase 3 + 4 model. `reserves/page.tsx` and `wallets/page.tsx` are RSCs that fetch initial data and render client islands.
- **Optimistic mutation + revalidate** — TanStack Query `onMutate` / `onError` / `onSettled` lifecycle. Pattern proven in Phase 4 quick-entry; reuse for inline-edit + drag.
- **URL-driven state for navigation** — Phase 3 tabs. No new URL params needed this phase (no month/filter selectors on Reserves or Wallets).
- **Money value object at adapter boundary** — domain stays UI-agnostic; client receives `{ balanceCents, currency }` and formats via `Intl.NumberFormat`. Same as Phase 3 home cards.
- **Multi-tenant isolation** — every new endpoint MUST include explicit `tenant_id` predicate; cross-tenant write returns 404. Phase 4 audit pattern (T-04-\* threats) applies to all new endpoints.

### Integration Points

- **Reserves tab init** → `GET /budgets/:id/reserves` (NEW endpoint). Composed read: joins `category_reserve_balance` VIEW + active categories + sum of reserve-type wallets, returns `rows[]` + `totals{}`.
- **Wallet inline cell edit** → `PATCH /wallets/:id` (verify exists; if not, add). Partial body `{ name? | currency? | amount? | type? }`. Server validates currency constraint for reserve-type wallets.
- **Drag-to-section** → same `PATCH /wallets/:id` with `{ type: NEW_TYPE }`. If new type = RESERVE and current currency ≠ budget currency → 422 with error code; client snaps back + shows toast.
- **Wallet create** → `POST /wallets` (existing route, Phase 2). Body `{ name, currency, amount, type }`. Optimistic create on Name-blur.
- **Wallet delete** → `POST /wallets/:id/archive` (existing route). Returns 200 with archived flag; client removes row optimistically.
- **Reserves invalidation** → after ANY wallet mutation where wallet.type or wallet.amount or wallet.currency changed AND (old.type == RESERVE OR new.type == RESERVE), invalidate `["budget", id, "reserves"]` query.
- **Tabs stay in BDP frame** — Phase 3 sticky pills + task banner remain mounted; Phase 5 fills only the tab-route `page.tsx` content.

</code_context>

<specifics>
## Specific Ideas

- **Wallets as 3 sections, NOT a Type column** — user pivoted from the original WALT-01 reading mid-discussion. Intent of WALT-01/02 (visibility + editability of type) preserved by making type the grouping axis. **This is the most important UX decision of Phase 5** — every component design must respect it.
- **Drag-and-drop changes type** — instead of an inline radio/segmented/dropdown for type. Visual + physical metaphor (move wallet from one box to another). Reuses Phase 4's drag primitive.
- **Hover IS allowed on Wallets** (deliberate softening of Phase 4 D-PH4-INT1 no-hover rule). Reasoning: wallets are form-like, sparse, edited rarely but directly; spendings grid is dense and benefits from click-reveal discipline. Different surfaces, different models.
- **Click any cell = direct edit** (not click-reveals-options-then-edit). Different from Phase 4. Form-like row UX, not data-grid row UX.
- **Reserve-type wallets MUST be in budget currency** — user-validated constraint that simplifies share math (no FX). Server enforces on create/edit/drag-to-Reserve-section.
- **Mismatch surfacing is silent this phase** — totals row math only. Phase 7 owns explicit task generation + banner. Reserves Actions column is a placeholder (`—` / muted icon).
- **Manual rebalance via inline-edit only** — no transfer modal, no +/− buttons. Click reserve balance cell → type new number → blur → adjustment row written. Mismatch chip on totals row reveals the in-flight delta until user finishes rebalancing (either by editing another category, by changing reserve-wallet amount, or by leaving the mismatch visible as a TODO). The bucket IS the UI.
- **Reserves tab gets a second Active/Excluded section** — visual rhyme with Wallets 3-section model. Drag a category between sections to opt-in/out of reserve math. Excluded rows show frozen balance (grayed) and are inert.
- **Global reserves toggle column lands this phase, UI in Phase 6** — `budgets.reserves_enabled` ships with cascading hide behavior (tab pill, spendings row, top pill). Phase 6 Settings provides the user-facing on/off control. Defaulting to `true` preserves current UX for existing budgets.
- **Soft-archive with no in-UI restore** — user explicitly chose this trade-off. Recovery requires admin/DB intervention. Confirmation dialog must say "can't be undone here" — literally accurate.
- **`+ Add wallet` dashed button per section** — explicit visual rhyme with Phase 4 `+ Add category` dashed column. Same DESIGN.md tokens, same NOT-yellow treatment.

</specifics>

<deferred>
## Deferred Ideas

- **Restore-archived-wallets UI** — user chose no toggle this phase. If users complain, add a "Show archived" toggle in Phase 6 Settings or a separate ticket.
- **Multi-currency reserve-type wallets** — explicitly rejected this phase to simplify share math. If users want it later, a future phase would need to introduce FX snapshotting per reserve wallet + drift-detection. Significant scope.
- **Reserve-mismatch banner + RESERVE_TOPUP task generation** — Phase 7 owns this. This phase ships totals + math + mismatch chip only.
- **Explicit transfer modal / atomic A→B paired adjustments** — deferred. Replaced by two-edit pattern + visible mismatch bucket (D-PH5-R13). Reconsider only if user feedback shows the two-edit flow confuses people.
- **Per-category mismatch task generation** — Phase 7. This phase shows only the global mismatch chip.
- **Reserves on/off toggle UI control** — Phase 6 Settings owns the user-facing checkbox/toggle. Phase 5 ships the column + cascading UI hide behavior only.
- **Adjustments audit-history view** — out of scope. Append-only table exists for future audit UI but Phase 5 surfaces no list/edit/revert affordance.
- **In-section reorder (drag within a section)** — natural consequence of cross-section drag but not strictly required by WALT-\*. Planning may defer to a separate ticket (needs new `sort_index` column on wallets).
- **Wallet detail / transaction-history view** — out of scope (WALT-07: wallets are manual snapshots, no ledger).
- **Bulk operations on wallets** (multi-select delete, bulk currency change) — out of scope.
- **Insights / charts using reserve-share data** — Phase out of scope (v1.1 ships placeholder dashboard only).
- **Restore-archived modal / soft-delete recovery flow** — defer to Phase 6 Settings if needed.

### Reviewed Todos (not folded)

None — no pending todos matched Phase 5 scope (todo.match-phase returned 0 matches).

</deferred>

---

_Phase: 5-Reserves & Wallets Tabs_
_Context gathered: 2026-05-17_
