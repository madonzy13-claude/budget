# Phase 5: Reserves & Wallets Tabs - Research

**Researched:** 2026-05-17
**Domain:** Multi-tier BDP tab (Hono REST + Drizzle/Postgres backend, RSC shell + TanStack Query client island, @dnd-kit cross-section drag, inline-edit autosave)
**Confidence:** HIGH (codebase fully verified — every cited path read; library versions verified in `apps/web/package.json`)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wallets tab layout — 3 grouped sections (NOT a Type column in rows)**

- D-PH5-W1: Render as three vertically-stacked sections (Spendings → Cushion → Reserve, fixed order). `Type` is the section, not a row cell. Rows show only Name / Currency / Amount.
- D-PH5-W2: Each section ends with a transparent dashed-border `+ Add wallet` button styled identically to Phase 4 `+ Add category` (same DESIGN.md tokens, NOT yellow). Click spawns a new wallet row inline at the bottom with focus on Name; the dashed button moves below the new row.
- D-PH5-W3: Empty sections still render header + dashed `+ Add wallet`. No helper copy.

**Wallets cell-interaction model — Phase 4 universal no-hover rule SOFTENED**

- D-PH5-W4: Wallets are form-like (sparse, edited rarely but directly). Phase 4 `D-PH4-INT1` (no-hover, single-click reveals) does NOT apply.
- D-PH5-W5 (desktop): At rest plain text. Hover → row highlight + trash icon. Click any cell → that cell becomes editable in place. Blur (or Tab) → PATCH /wallets/:id with optimistic update + toast. Tab order: Name → Currency → Amount → next row's Name (no Type cell).
- D-PH5-W6 (mobile): First tap → row highlight + trash icon. Second tap on cell (or double-tap directly) → editable. Tap outside / scroll → blur saves.
- D-PH5-W7 (drag): Drag handle on left (reuse Phase 4 `<RowDragHandle>` / lucide `GripVertical`). Drop into another section's drop zone → PATCH /wallets/:id `{type: NEW_TYPE}`.
- D-PH5-W8 (drag validation): Non-budget-currency wallet dropped into Reserve section → server rejects, toast "Reserve wallets must be in budget currency {CCY}", row snaps back.

**Reserves tab data shape + share math**

- D-PH5-R1: New endpoint `GET /budgets/:id/reserves` returns `{ rows: [{ categoryId, name, reserveBalance, walletSharePercent, walletShareAmount }], totals: { totalCategoryReserves, totalReserveWalletAmount, mismatch } }`. All currency in budget currency, integer cents. (Note: an endpoint of the same path already exists with a minimal shape — must be EXTENDED, see Architecture below.)
- D-PH5-R2: `walletSharePercent(c) = (reserveBalance(c) / Σ reserveBalance) × 100`; `walletShareAmount(c) = walletSharePercent(c) × Σ(reserve-type-wallet amounts) / 100`. Server-side.
- D-PH5-R3: Reserve-type wallets MUST be in budget default currency. Server validation on (a) wallet create, (b) currency change, (c) type change to RESERVE.
- D-PH5-R4 (edge cases): `Σ reserveBalance == 0` → entire share column renders `—`. `Σ reserve wallets == 0` → share column `—`. New category with no history → reserve balance `0.00`, share `—`.
- D-PH5-R5: No banner / no task this phase. Mismatch is implicit via totals row only. Phase 7 owns explicit task.
- D-PH5-R6: Actions column placeholder (`—` or muted lucide `MoreHorizontal`). i18n header `bdp.tab.reserves.actions`.

**Wallet defaults + delete semantics**

- D-PH5-W9: `+ Add` defaults — type=section (locked), currency=budget default (read-only in Reserve section), amount=0, name=empty (focus). Optimistic create on Name blur with non-empty value.
- D-PH5-W10: Delete = soft-archive via existing `POST /wallets/:id/archive`. No restore UI. Dialog text: "Delete wallet '{name}'? This can't be undone here."
- D-PH5-W11: Wallet delete does NOT affect transactions (per WALT-07, manual snapshots).

**Engineering discipline**

- D-PH5-E1: TanStack Query. Query keys `["budget", id, "reserves"]` and `["budget", id, "wallets"]`. Cross-invalidate `reserves` whenever a reserve-type wallet mutates OR a wallet's type changes to/from Reserve.
- D-PH5-E2: RSC + client island (Phase 3/4 pattern). `reserves/page.tsx` (RSC) fetches initial `/budgets/:id/reserves`; `wallets/page.tsx` (RSC) fetches initial `/wallets`.
- D-PH5-E3: Reuse @dnd-kit (Phase 4). Cross-section DnD context; sections are drop zones.
- D-PH5-E4: i18n EN + PL + UK. Namespaces `bdp.tab.reserves.*`, `bdp.tab.wallets.*`.
- D-PH5-E5: Backend integration tests (no DB mocks). Vitest component. Playwright BDD Gherkin for full add → edit → drag → delete → reserves-share flow.
- D-PH5-E6: DESIGN.md tokens. Dashed `+ Add` is NOT yellow. Run impeccable sweep before close.

### Claude's Discretion

- Layout primitive sharing — separate `<ReservesTable>` + `<WalletsSectionedList>` with shared atoms: `<RowDragHandle>` (exists), `<InlineEditCell>` (new), `<DashedAddButton>` (new — generalize Phase 4 add-category-column), `<TableRowHover>` (token application).
- `<InlineEditCell>` primitive — new atom wrapping `<input>` / `<select>` with click-to-edit + blur-to-save + optimistic state.
- In-section reorder — NOT required by WALT-\*. Recommendation: defer (would need new `sort_index` column on wallets).
- Drop-zone visuals — section tint on drag-over, drop-line indicator (standard @dnd-kit).
- Mobile drag activation — `PointerSensor` `{ delay: 300, tolerance: 5 }` for cross-section drag (Phase 4 spendings grid uses `TouchSensor { delay: 200, tolerance: 8 }` — picked here for slightly stricter tap-vs-drag disambiguation in form-like rows).
- Reserves footer row — sticky bottom totals row with `Σ` glyph prefix (final sketch).
- Toast — reuse `sonner` (Phase 4 — already in deps as `sonner: latest`).

### Deferred Ideas (OUT OF SCOPE)

- Restore-archived-wallets UI (Phase 6 Settings if needed)
- Multi-currency reserve-type wallets (explicit rejection — would need FX snapshotting + drift detection)
- Reserve-mismatch banner + RESERVE_TOPUP task generation (Phase 7)
- In-section reorder drag-within-section (needs new column; defer)
- Wallet detail / transaction-history view (out of scope per WALT-07)
- Bulk wallet operations (multi-select delete, bulk currency change)
- Insights / charts using reserve-share data (v1.1 ships placeholder dashboard only)
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                          | Research Support                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RSRV-01 | Reserves table: Category \| Reserve balance \| Reserve wallet share \| Actions                       | New composed-read endpoint extending existing GET /budgets/:id/reserves (see Architecture §1). Actions column placeholder per D-PH5-R6.                                                                                                                                     |
| RSRV-02 | Reserve balance auto-computed cumulative `max(0, active_budget(m) − spent(m))` minus reserves pulled | **Already implemented Phase 2** via `budgeting.category_reserve_balance` VIEW (read by `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts`). Phase 5 only consumes it.                                                                                    |
| RSRV-03 | Active_budget uses cushion-mode state as of that month (history tracked)                             | **Phase 2 VIEW already handles** (per `reserve-balance-repo.ts` comment: "RSCM-01 + RSCM-02 per D-PH2-02").                                                                                                                                                                 |
| RSRV-04 | Reserve consumed real-time on overspend; shown in GRID-02 row 4                                      | **Phase 4 already implements** (RSCM-03 marked done in REQUIREMENTS.md row 309–310). Phase 5 only needs to refetch reserves query when invalidated by a transaction confirm — handled by cross-invalidation pattern (`onSettled`: invalidate `["budget", id, "reserves"]`). |
| RSRV-05 | Per-category reserve isolation                                                                       | Phase 2 VIEW enforces (one balance per category). Phase 5 surfaces; no logic change.                                                                                                                                                                                        |
| RSRV-06 | Reserve wallet share = `(this cat reserve / Σ all reserves) × Σ(reserve-type wallet amounts)`        | New server-side computation in extended `/reserves` endpoint (D-PH5-R2). Edge cases per D-PH5-R4.                                                                                                                                                                           |
| RSRV-07 | New category with no history shows reserve = 0                                                       | Reserve-balance-repo handles via `Money.of("0", currency)` when no row found — already in code. Render layer must show share `—` (D-PH5-R4).                                                                                                                                |
| WALT-01 | One row per wallet, inline-editable Name / Currency / Amount / Type                                  | **DEVIATION from literal text**: per D-PH5-W1, Type becomes section grouping (not row cell). Intent (visibility + editability of type) preserved via drag-between-sections (D-PH5-W7).                                                                                      |
| WALT-02 | Type cell single-select Spendings/Cushion/Reserve                                                    | Section header is single-select target via drag (D-PH5-W7). Picked via drop zone, not radio/segmented control.                                                                                                                                                              |
| WALT-03 | Tab key moves between cells; auto-save on blur with toast                                            | New `<InlineEditCell>` primitive + new `useUpdateWallet` mutation hook (mirror `use-update-transaction.ts`). Toast via `sonner`.                                                                                                                                            |
| WALT-04 | `+ Add wallet` row at bottom; click spawns blank row with focus on Name                              | Per section (D-PH5-W2). New `<DashedAddButton>` atom (generalize `apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx`).                                                                                                                               |
| WALT-05 | Delete via trash icon on row hover; confirmation required                                            | Existing `POST /wallets/:id/archive` route handles backend. Confirm via `<AlertDialog>` (exists at `apps/web/src/components/ui/alert-dialog.tsx`). Mobile-tap reveal per D-PH5-W6.                                                                                          |
| WALT-06 | Wallet types are display labels only; no income/transfer ledger                                      | No backend behavior change; type only affects UI grouping + reserves-share math (reserve-type wallets only).                                                                                                                                                                |
| WALT-07 | Wallet balances are manual snapshots; no auto-update from transactions                               | Existing `PUT /wallets/:id/balance` (D-PH2-09 amended) already implements absolute-overwrite semantics. NOTE: For inline-edit amount, Phase 5 will use a new partial PATCH instead (consolidates name/currency/type/amount under one route) — see Architecture §2.          |

</phase_requirements>

## Summary

The phase splits cleanly into one **server-side extension** (extend the existing minimal `GET /budgets/:id/reserves` to add share columns + totals) and one **wallet write surface expansion** (new PATCH /wallets/:id covering name/currency/amount/type with reserve-currency validation; new domain mutation methods on the Wallet aggregate — currently the only writes the domain exposes are `applyAdjustment`, `archive`, and `canChangeCurrency` which always errors). On the frontend, the two tabs are sibling client islands hung off existing RSC placeholders; they share a small set of new atoms (`<InlineEditCell>`, `<DashedAddButton>`, drop-zone wrappers) and reuse Phase 4 primitives (`<RowDragHandle>`, sensor config, TanStack Query patterns) verbatim. No new external dependencies.

The single most consequential surprise: **the Wallet domain entity currently has `canChangeCurrency()` returning a hard `err()` to enforce WALT-04 immutability**, and `setBalance` rejects currency mismatches. CONTEXT.md (D-PH5-W5) lists Currency as an inline-editable cell. Either D-PH5-W5 narrows to "Currency editable only when the wallet has zero transactions referencing it" (not possible per WALT-07 — wallets have NO transaction link), or the WALT-04 immutability rule must be officially relaxed. **This is the only `[ASSUMED]` decision in this research** — see Open Questions Q1 and Assumptions Log.

**Primary recommendation:** Ship 5 plans — (1) backend reserves-summary extension + reserve-currency validation, (2) backend wallet PATCH route + use case + domain mutation methods, (3) shared frontend atoms (`<InlineEditCell>`, `<DashedAddButton>`, drop-zone helpers, hooks), (4) Reserves tab client island + RSC wiring, (5) Wallets tab client island + RSC wiring + Playwright BDD e2e flow. Each plan keeps backend and frontend cleanly separated (TDD red-first easier).

## Architectural Responsibility Map

| Capability                                                          | Primary Tier              | Secondary Tier                    | Rationale                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Reserve-share math (per-cat % + amount)                             | API / Backend             | —                                 | Composed read joining `category_reserve_balance` VIEW + `wallets` sum; single source of truth for Phase 7 task generator reuse (D-PH5-R1) |
| Reserve-currency invariant (RESERVE wallets must = budget currency) | Domain (Wallet aggregate) | API (422 surface)                 | Invariant lives with the entity; route translates to HTTP. Domain currently lacks the constraint — must be added.                         |
| Inline-cell autosave lifecycle (click → edit → blur → mutation)     | Browser / Client          | —                                 | Pure UI state; server is stateless single PATCH                                                                                           |
| Drag-between-sections (type change)                                 | Browser / Client          | API (PATCH /wallets/:id `{type}`) | @dnd-kit owns drag UX; PATCH persists; server validates currency for RESERVE drop                                                         |
| Soft-archive                                                        | API / Backend             | Browser (optimistic remove)       | Existing route; client just hides row and revalidates reserves                                                                            |
| Cross-tab invalidation (wallet edit → reserves refetch)             | Browser / Client          | —                                 | TanStack Query queryClient.invalidateQueries — pure cache concern                                                                         |
| RSC initial fetch + hydration                                       | Frontend Server (SSR)     | —                                 | Phase 3/4 pattern: `serverApiFetch(budgetId, …)` sets X-Budget-ID per T-04-04-07                                                          |
| Tenant isolation gate on `/reserves` and `/wallets`                 | API / Backend             | DB (RLS)                          | Route checks `budgetId === tenantId` per Phase 4 pattern; RLS is defense in depth                                                         |

## Standard Stack

All required dependencies are **already installed** — no new packages needed.

### Core (verified in `apps/web/package.json` and `apps/api/package.json`)

| Library                                   | Version    | Purpose                                                                       | Why Standard                                                                                                                 |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@dnd-kit/core`                           | 6.3.1      | Drag-drop primitives                                                          | `[VERIFIED: apps/web/package.json]` Reused from Phase 4 category-reorder; cross-section drag is core use case                |
| `@dnd-kit/sortable`                       | 10.0.0     | Sortable container (in-section reorder if implemented)                        | `[VERIFIED: apps/web/package.json]`                                                                                          |
| `@dnd-kit/utilities`                      | 3.2.2      | `CSS.Transform` + helpers                                                     | `[VERIFIED: apps/web/package.json]`                                                                                          |
| `@tanstack/react-query`                   | ^5         | Optimistic mutations + cache invalidation                                     | `[VERIFIED: apps/web/package.json]` Phase 4 standard                                                                         |
| `sonner`                                  | latest     | Toast                                                                         | `[VERIFIED: apps/web/package.json]` Phase 4 standard (`apps/web/src/components/ui/sonner.tsx`)                               |
| `@hookform/resolvers` + `react-hook-form` | latest     | Optional form wrapper for inline-edit validation                              | `[VERIFIED: apps/web/package.json]` Reusable but **probably overkill for single-cell edit** — local `useState` is sufficient |
| `next-intl`                               | (existing) | i18n with EN + PL + UK                                                        | `[VERIFIED: existing per BdpTabs]`                                                                                           |
| `lucide-react`                            | (existing) | Icons (`GripVertical`, `Trash2`, `MoreHorizontal`, `Plus`, `Coins`, `Wallet`) | `[VERIFIED: bdp-tabs.tsx uses these]`                                                                                        |
| `hono` v4 + `@hono/zod-validator`         | (existing) | API route + validation                                                        | `[VERIFIED: every route in apps/api/src/routes/*.ts]`                                                                        |
| `zod` v3                                  | (existing) | DTO schemas                                                                   | `[VERIFIED: packages/budgeting/src/contracts/api.ts]`                                                                        |
| `drizzle-orm`                             | (existing) | Adapter SQL                                                                   | `[VERIFIED: packages/budgeting/src/adapters/persistence/*.ts]`                                                               |
| `bun:test` + `pg`                         | (existing) | Backend integration tests against real Postgres                               | `[VERIFIED: apps/api/test/routes/reserves.test.ts, wallets.test.ts]`                                                         |
| `playwright-bdd`                          | ^8.5.0     | Gherkin E2E                                                                   | `[VERIFIED: package.json + tests/e2e/features/]`                                                                             |

### Alternatives Considered (all rejected)

| Instead of                                                     | Could Use                 | Tradeoff (why rejected)                                                |
| -------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `@dnd-kit/core` cross-section                                  | `react-dnd`               | Already on @dnd-kit; switching costs > benefit                         |
| `react-hook-form` per cell                                     | Local `useState` per cell | RHF is heavier than necessary for one-input cells; use local state     |
| New endpoint family `/wallets/:id/{name,currency,amount,type}` | One PATCH /wallets/:id    | Phase 4 uses PATCH /transactions/:id for inline edit — keep convention |

## Architecture Patterns

### System Architecture Diagram

```
                   ┌──────────────────────────────────────────────┐
                   │ /budgets/[id]/reserves (RSC)                 │
                   │   serverApiFetch → GET /budgets/:id/reserves │ ◄── parallel
                   │   (composed: reserves + share + totals)      │
                   └─────────────┬────────────────────────────────┘
                                 │ initial
                                 ▼
                   ┌──────────────────────────────────────────────┐
                   │ <ReservesTableClient initial={…} />          │
                   │   useQuery(["budget", id, "reserves"])       │
                   │   render rows + sticky totals footer         │
                   └──────────────────────────────────────────────┘

                   ┌──────────────────────────────────────────────┐
                   │ /budgets/[id]/wallets (RSC)                  │
                   │   serverApiFetch → GET /wallets              │
                   └─────────────┬────────────────────────────────┘
                                 │ initial
                                 ▼
                   ┌──────────────────────────────────────────────┐
                   │ <WalletsSectionedList initial={…} />         │
                   │   useQuery(["budget", id, "wallets"])        │
                   │   3 sections + drop zones (DndContext)       │
                   │   <InlineEditCell> per Name|Currency|Amount  │
                   │   <DashedAddButton/> per section bottom      │
                   └─────────────┬────────────────────────────────┘
                                 │ on mutation
                                 ▼
        useUpdateWallet ──── PATCH /wallets/:id ────► Wallet aggregate
        useCreateWallet ─── POST /wallets         ──►  validates reserve-cur
        useArchiveWallet ── POST /wallets/:id/archive    invariant; writes
                                 │                       audit + outbox
                                 │ onSettled
                                 ▼
                   qc.invalidate(["budget", id, "reserves"])  ─── if mutation
                                                                  touched a
                                                                  RESERVE wallet
```

Data flow:

1. RSC fetches initial state per request (T-04-04-07: `X-Budget-ID` header on every fetch).
2. Client island hydrates TanStack Query cache from `initialData`; subsequent fetches are pure client.
3. Mutations are optimistic (`onMutate` snapshot + rollback on error); `onSettled` invalidates relevant queries.
4. Cross-tab invalidation: any wallet mutation where `(old.type==RESERVE || new.type==RESERVE)` OR `amount changed && type==RESERVE` triggers invalidation of `["budget", id, "reserves"]`.

### Recommended File Layout

```
apps/api/src/routes/
├── budgets.ts                                ← EXTEND existing GET /:id/reserves (D-PH5-R1)
└── wallets.ts                                ← ADD PATCH /:id route

apps/api/test/routes/
├── reserves.test.ts                          ← EXTEND existing test (add totals + share + tenant gate)
└── wallets.test.ts                           ← EXTEND existing test (add PATCH cases)

packages/budgeting/src/
├── domain/wallet.ts                          ← ADD rename(), changeType(), changeCurrency()/setAmount() with
│                                                reserve-currency invariant
├── ports/wallet-repo.ts                      ← ADD update(walletId, partial) method
├── adapters/persistence/wallet-repo.ts       ← IMPLEMENT update() with audit+outbox
├── application/update-wallet.ts              ← NEW use case
├── application/get-reserves-summary.ts       ← NEW use case (joins reserve-balance + wallets sum)
├── ports/reserves-summary-repo.ts            ← NEW port (or reuse reserveBalanceRepo + walletRepo)
├── adapters/persistence/reserves-summary-repo.ts  ← NEW (one query: sum of reserve-type wallet amounts in budget currency)
├── contracts/api.ts                          ← ADD updateWalletSchema + ReservesSummaryDto
└── contracts/factory.ts                      ← WIRE new use case + repo

apps/web/src/components/budgeting/
├── reserves-tab/
│   ├── reserves-table-client.tsx             ← NEW client island
│   ├── reserves-table-row.tsx                ← NEW (formats share % + amount; em-dash for zeros)
│   └── reserves-totals-footer.tsx            ← NEW sticky bottom row
└── wallets-tab/
    ├── wallets-sectioned-list.tsx            ← NEW client island (DndContext owner)
    ├── wallet-section.tsx                    ← NEW (header + rows + dashed add button; droppable)
    ├── wallet-row.tsx                        ← NEW (draggable + inline cells + hover trash)
    └── wallet-delete-confirm.tsx             ← NEW AlertDialog wrapper

apps/web/src/components/common/
├── inline-edit-cell.tsx                      ← NEW shared atom (click→edit→blur-save lifecycle)
└── dashed-add-button.tsx                     ← NEW shared atom (generalize add-category-column)

apps/web/src/hooks/
├── use-wallets.ts                            ← NEW (queryKey ["budget", id, "wallets"])
├── use-reserves-summary.ts                   ← NEW (queryKey ["budget", id, "reserves"])
├── use-create-wallet.ts                      ← NEW optimistic POST /wallets
├── use-update-wallet.ts                      ← NEW optimistic PATCH /wallets/:id
└── use-archive-wallet.ts                     ← NEW optimistic POST /wallets/:id/archive

apps/web/src/app/[locale]/(app)/budgets/[id]/
├── reserves/page.tsx                         ← REPLACE placeholder (RSC fetches /reserves; renders client)
└── wallets/page.tsx                          ← REPLACE placeholder (RSC fetches /wallets; renders client)

apps/web/messages/{en,pl,uk}.json             ← ADD bdp.tab.reserves.* + bdp.tab.wallets.* keys

apps/web/test/                                 ← Vitest component tests for InlineEditCell, DashedAddButton,
                                                  WalletRow drag handlers, ReservesTotalsFooter dash logic

tests/e2e/features/wallets/                   ← NEW Gherkin .feature files (per CLAUDE.md memory: BDD + Page Objects)
tests/e2e/pages/                              ← NEW WalletsPage, ReservesPage Page Objects
```

### Pattern 1: Composed-Read Endpoint (extends existing `/reserves`)

**What:** Replace the minimal `{ budgetId, reserves: [{categoryId, balanceCents}] }` shape with the D-PH5-R1 shape `{ rows: [...], totals: {...} }`. Existing endpoint is in `apps/api/src/routes/budgets.ts:273-294`.

**When:** Phase 5 only — Phase 2 endpoint is unused (no UI calls it). Safe to replace shape.

**Example pattern (mirrors `spendings-summary.ts`):**

```typescript
// Source: VERIFIED apps/api/src/routes/spendings-summary.ts pattern
r.get("/:id/reserves", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const budgetId = c.req.param("id");
  const tenantId = pickTenant(c);
  if (budgetId !== tenantId) {
    return c.json({ error: "tenant_mismatch" }, 403); // T-04-02-08 pattern
  }

  const result = await deps.budgeting.getReservesSummary({
    tenantId,
    budgetId,
  });
  if (result.isErr())
    return serverError(c, "reserves_summary_failed", result.error);
  return c.json(result.value, 200);
});
```

The use case (`get-reserves-summary.ts`) composes:

1. `reserveBalanceRepo.getForBudget(budgetId, tenantId, new Date())` (existing — returns `Map<categoryId, Money>`).
2. `categoryRepo.list(tenantId)` to attach names + filter archived.
3. New `reservesSummaryRepo.sumReserveWalletAmounts(tenantId)` — single SQL: `SELECT COALESCE(SUM(current_balance), 0) FROM budgeting.wallets WHERE tenant_id = $1 AND wallet_type = 'RESERVE' AND archived_at IS NULL` (currency invariant guarantees all rows in budget currency).
4. Compute shares in JS — keeps SQL trivial.

### Pattern 2: PATCH /wallets/:id (consolidated partial update)

**What:** One PATCH endpoint handles inline-edit of `name` (text), `amount` (numeric overwrite), `type` (drag-between-sections). `currency` field included in zod schema but server REJECTS it with 422 if WALT-04 immutability is upheld (Open Q1).

**Why a new route instead of extending `PUT /wallets/:id/balance`:** Phase 4 establishes PATCH for partial transaction updates (`PATCH /budgets/:budgetId/transactions/:txId`). One PATCH per resource is cleaner than 4 sub-routes.

**Example schema:**

```typescript
// Source: ASSUMED (new) — mirrors apps/api/src/routes/transactions.ts PATCH pattern
export const updateWalletSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    amount: z
      .string()
      .regex(/^-?\d+(\.\d{1,4})?$/)
      .optional(),
    walletType: walletTypeSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z0-9]{3,5}$/)
      .optional(), // see Open Q1
  })
  .refine((d) => Object.keys(d).length > 0, { message: "empty_body" });
```

**Server-side validation order** (use case `update-wallet.ts`):

1. Load wallet by id (404 if not found OR tenant mismatch).
2. Compute `effectiveType = body.walletType ?? wallet.walletType` and `effectiveCurrency = body.currency ?? wallet.currency`.
3. If `effectiveType === 'RESERVE'`: look up budget default currency from `tenancy.budgets.default_currency`. If `effectiveCurrency !== budgetCurrency` → return `err("reserve_currency_mismatch")` → route returns 422 with i18n error key.
4. Apply changes (rename, setType, setBalance, setCurrency) — each writes audit + outbox.

### Pattern 3: Cross-Section DnD (sections as drop zones, rows as draggables)

**What:** A single `<DndContext>` wraps all three `<WalletSection>` components. Each section is `useDroppable({ id: 'section-SPENDINGS' })`. Each `<WalletRow>` is `useDraggable({ id: wallet.id })`.

**Why not `<SortableContext>` per section?** Sortable is for reorder WITHIN a list. Cross-section move needs raw draggable + droppable. (In-section reorder is deferred — see Claude's Discretion.)

**Example pattern (verified Phase 4 sensor config in `spendings-grid-client.tsx:125-129`):**

```typescript
// Source: VERIFIED apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx:125
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 300, tolerance: 5 },
  }),
  useSensor(KeyboardSensor),
);

function handleDragEnd(e: DragEndEvent) {
  const { active, over } = e;
  if (!over) return;
  const newType = over.id.toString().replace("section-", "") as WalletType;
  const wallet = walletsById.get(active.id.toString());
  if (!wallet || wallet.walletType === newType) return;
  // optimistic update via TanStack Query; rollback on error
  updateWalletMut.mutate(
    { walletId: wallet.id, walletType: newType },
    {
      onError: () => toast.error("reserve_currency_mismatch"),
    },
  );
}
```

### Pattern 4: Inline-Edit Cell Lifecycle (new `<InlineEditCell>` atom)

**What:** Encapsulates click → input renders → blur saves → optimistic UI → toast.

**Why an atom:** Three column types (text, select, numeric) all share the same lifecycle. Phase 6 budget-name edit will reuse.

**Example (proposed — see `use-update-transaction.ts` for the mutation half):**

```typescript
// Source: ASSUMED (new) — mutation pattern VERIFIED from apps/web/src/hooks/use-update-transaction.ts
interface InlineEditCellProps<T> {
  value: T;
  render: (v: T) => React.ReactNode;
  renderEditor: (v: T, onChange: (v: T) => void, onCommit: () => void) => React.ReactNode;
  onSave: (v: T) => Promise<void>;     // throws → toast.error
  ariaLabel: string;
  disabled?: boolean;
}

export function InlineEditCell<T>(props: InlineEditCellProps<T>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (draft === props.value) { setEditing(false); return; }
    setSaving(true);
    try {
      await props.onSave(draft);
      toast.success("wallets.toast.saved");
    } catch (e) {
      toast.error("wallets.toast.saveFailed");
      setDraft(props.value);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <div role="button" tabIndex={0} onClick={() => !props.disabled && setEditing(true)}
           onKeyDown={(e) => e.key === "Enter" && !props.disabled && setEditing(true)}
           aria-label={props.ariaLabel}>
        {props.render(props.value)}
      </div>
    );
  }
  return props.renderEditor(draft, setDraft, commit);
}
```

### Anti-Patterns to Avoid

- **Hand-rolling drag-drop with `onMouseDown`/`onPointerMove`.** Use @dnd-kit — proven, accessible, mobile-correct. Phase 4 already uses it.
- **Computing share math in the client.** Server-side per D-PH5-R1. Phase 7 task generator must read the same numbers.
- **Skipping the optimistic rollback on drag error.** When server rejects a RESERVE drop with non-budget currency, the row MUST snap back. TanStack Query's `onError` ctx pattern (see `use-reorder-categories.ts:62-67`) is the model.
- **`Date.now()` for `currentBalance` parsing.** Money parsing must go through the existing `Money.fromDb` adapter (in `wallet-repo.ts:27`) — never `parseFloat`.
- **Forgetting `archived_at IS NULL` filter on the reserves-summary wallet sum.** Archived wallets must NOT count toward share denominator. Existing list query (verified in `wallet-repo.ts:118`) already enforces this for the includeArchived=false path; reuse the same predicate.
- **Mixing tenant cookies/sessions with budget ID inference.** Always use `serverApiFetch(budgetId, …)` per T-04-04-07; never raw `fetch` from RSC.

## Don't Hand-Roll

| Problem                           | Don't Build                             | Use Instead                                                                      | Why                                              |
| --------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Drag-and-drop                     | Custom HTML5 drag events                | `@dnd-kit/core` `useDraggable` + `useDroppable`                                  | Accessibility + touch + keyboard already solved  |
| Mobile tap-vs-drag discrimination | Custom touchstart timers                | `TouchSensor { delay: 300, tolerance: 5 }`                                       | Battle-tested in Phase 4 spendings grid          |
| Optimistic cache management       | Manual `useState` mirror of server data | TanStack Query `onMutate`/`onError`/`onSettled` ctx                              | Atomic rollback; cross-query invalidation        |
| Money arithmetic                  | `parseFloat(amount) * 100`              | `Money.fromDb()` + `Money.of()` from `@budget/shared-kernel`                     | Decimal precision; cross-currency rejection      |
| Confirmation dialog               | Native `confirm()`                      | `<AlertDialog>` from `apps/web/src/components/ui/alert-dialog.tsx`               | Theme-aware; mobile-correct; aria-labeled        |
| Toast                             | Custom snackbar                         | `sonner` (already in deps, Phase 4 uses)                                         | One toast container in `app/[locale]/layout.tsx` |
| Form validation                   | `if (!name) error` chains               | `zod` schemas in `contracts/api.ts`                                              | Single source of truth client + server           |
| Audit trail on writes             | Manual `INSERT INTO audit`              | `writeAudit(tx, …)` from `@budget/platform` (verified in `wallet-repo.ts:53-65`) | Tenant-aware, batched-safe                       |

**Key insight:** Every primitive needed is already in the codebase. Phase 5 is composition + a small set of new atoms, not infrastructure.

## Runtime State Inventory

**Not applicable** — this is a greenfield feature phase (no rename/refactor/migration). New tables/columns: **none required**. Existing schema covers all requirements:

- `budgeting.wallets` — `wallet_type IN ('SPENDINGS','CUSHION','RESERVE')` CHECK already present (verified in `wallets-schema.ts:31`).
- `budgeting.category_reserve_balance` VIEW — already populated by Phase 2 migration 0013/0014 (verified in `reserve-balance-repo.ts:6`).
- `archived_at` column on wallets — already exists (verified in `wallets-schema.ts:18`).

**No data migration needed.** No live service config touched. No OS-registered state. No new secrets. No build artifact carries old name.

## Common Pitfalls

### Pitfall 1: Existing `/budgets/:id/reserves` endpoint has wrong shape

**What goes wrong:** Phase 2 already shipped `GET /budgets/:id/reserves` returning `{ budgetId, reserves: [{categoryId, balanceCents}] }` (verified at `apps/api/src/routes/budgets.ts:273-294`). Phase 5 needs the D-PH5-R1 shape (`rows + totals`).
**Why it happens:** Different consumer (Phase 2 was internal; Phase 5 is UI).
**How to avoid:** **Replace** the existing endpoint body, not add a sibling. No production consumer (verified — no `apps/web/**` calls it; placeholder pages don't fetch). Update the existing test `apps/api/test/routes/reserves.test.ts` instead of creating new file.
**Warning signs:** Reserves tab renders blank because client expects `rows[0].reserveBalance` but server returns `reserves[0].balanceCents`.

### Pitfall 2: Wallet domain has no rename / setType / setAmount methods

**What goes wrong:** Domain exposes only `archive()`, `applyAdjustment(delta)`, `canChangeCurrency()` (always errors). No `rename()`. No `changeType()`. No `setAmount()`. Plan tasks assuming "just call wallet.rename(name)" will fail.
**Why it happens:** Phase 1 + 2 only needed create/archive/setBalance (via repo, bypassing domain mutator).
**How to avoid:** Plan a domain-layer task adding mutation methods BEFORE the application/route layer. Each method returns `Result<void, Error>` and updates `before`/`after` audit payloads. Update `WalletRepo.update()` port signature accordingly.
**Warning signs:** Vitest red on a `wallet.rename("foo")` call that won't compile.

### Pitfall 3: WALT-04 currency immutability vs CONTEXT.md inline-edit Currency

**What goes wrong:** `Wallet.canChangeCurrency()` returns `err("Wallet currency is immutable per WALT-04...")` (verified `wallet.ts:31-38`). CONTEXT.md D-PH5-W5 lists Currency as inline-editable. They contradict.
**Why it happens:** D-PH5-W5 generalizes "click any cell becomes editable"; WALT-04 was set when wallets had transaction links. Post-Phase 2 amendment (D-PH2-09: wallet balance fully decoupled from transactions) makes immutability less justified, BUT the rule has not been formally rescinded.
**How to avoid:** Flag to user before planning starts (see Open Q1). Two options: (a) explicitly rescind WALT-04 for Phase 5 ("currency editable in inline cell; amount stays as-is — no FX conversion"), OR (b) render Currency cell as read-only label (matches WALT-04 literally; D-PH5-W5 narrows to "Name + Amount editable, Currency display-only"). Recommendation: option (b) — simpler, preserves invariant, only minor UX nit (user must delete + recreate to change currency).
**Warning signs:** First Vitest red on currency-change request returns 422 with hardcoded WALT-04 message; user is surprised.

### Pitfall 4: Reserve-currency invariant only enforced on TYPE drag, not on CURRENCY change of an existing RESERVE wallet

**What goes wrong:** User drags a EUR wallet into Reserve section — server validates correctly. Then user inline-edits the Currency cell to USD on a wallet already in Reserve section. If validation only fires on `wallet_type` change, USD reserve wallet slips in.
**How to avoid:** Validate the invariant on EVERY PATCH where `(effective_type === 'RESERVE') AND (effective_currency !== budgetCurrency)`, regardless of which field changed. See Pattern 2 step 3.
**Warning signs:** Integration test "RESERVE wallet currency change to non-budget rejected" returns 200.

### Pitfall 5: Cross-tenant 404 vs 403 confusion

**What goes wrong:** Phase 4 uses `403 tenant_mismatch` when `budgetId !== tenantId` (verified `spendings-summary.ts:37-39`). Other repos return `404 not found` for cross-tenant access via RLS-induced empty result. Mixed conventions confuse the security audit gate.
**How to avoid:** New `/reserves` and PATCH /wallets/:id MUST mirror Phase 4: explicit `budgetId !== tenantId` check returns 403; resource-not-found returns 404. Add both tests.
**Warning signs:** `make ci-gate` (multi-tenant leak gate) fails or audit finds inconsistent codes.

### Pitfall 6: Sonner toast key vs translated string

**What goes wrong:** Phase 4 hook `use-reorder-categories.ts:65` calls `toast.error("grid.error.reorderSave")` — passing the i18n KEY as the toast string. The Sonner provider does NOT translate keys; this is a latent bug or convention (raw key shown). Inspect before mirroring.
**How to avoid:** Confirm Phase 4 toast behavior. If raw key is acceptable, do the same; otherwise wrap with `useTranslations()` at call site.
**Warning signs:** Toast shows literal `wallets.toast.saved` instead of "Wallet saved".

### Pitfall 7: `archived_at IS NULL` filter forgotten in reserves-summary wallet sum

**What goes wrong:** New `reservesSummaryRepo.sumReserveWalletAmounts(tenantId)` query omits the predicate; archived RESERVE wallets inflate the denominator.
**How to avoid:** Copy the predicate from `wallet-repo.ts:138` verbatim: `WHERE tenant_id = $1 AND wallet_type = 'RESERVE' AND archived_at IS NULL`.
**Warning signs:** E2E test archives a reserve wallet; share % stays the same; mismatch should change.

## Code Examples

### Cross-section drag handler (verified patterns from Phase 4 + @dnd-kit docs)

```typescript
// Source: VERIFIED apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx:145-159
// Adapted for cross-section drop semantics (not array reorder).
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 300, tolerance: 5 },
  }),
  useSensor(KeyboardSensor),
);

function handleDragEnd(e: DragEndEvent) {
  const { active, over } = e;
  if (!over) return;
  const droppedSectionId = String(over.id); // 'section-RESERVE'
  if (!droppedSectionId.startsWith("section-")) return;
  const newType = droppedSectionId.slice("section-".length) as WalletType;
  const wallet = walletsById.get(String(active.id));
  if (!wallet || wallet.walletType === newType) return;
  updateWalletMut.mutate({ walletId: wallet.id, walletType: newType });
}
```

### Reserve-currency invariant in use case (proposed)

```typescript
// Source: ASSUMED (new) — mirrors VERIFIED packages/budgeting/src/application/set-wallet-balance.ts pattern
export function updateWallet(deps: {
  repo: WalletRepo;
  budgetCurrencyOf: (tid: string) => Promise<string>;
}) {
  return async (input: {
    tenantId: string;
    walletId: string;
    actorUserId: string;
    name?: string;
    amount?: string;
    currency?: string;
    walletType?: WalletType;
  }): Promise<Result<void, Error>> => {
    const wallet = await deps.repo.findById(input.tenantId, input.walletId);
    if (!wallet) return err(new Error("not_found"));
    const effectiveType = input.walletType ?? wallet.walletType;
    const effectiveCurrency = input.currency ?? wallet.currency;
    if (effectiveType === "RESERVE") {
      const budgetCcy = await deps.budgetCurrencyOf(input.tenantId);
      if (effectiveCurrency !== budgetCcy) {
        return err(new Error("reserve_currency_mismatch"));
      }
    }
    // ... apply changes via repo.update(...)
    return ok(undefined);
  };
}
```

### Dashed-add-button atom (generalize Phase 4)

```typescript
// Source: VERIFIED apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx
// Generalize by accepting label + size props; same dashed border tokens.
export interface DashedAddButtonProps {
  onClick: () => void;
  label: string; // already translated by caller
  ariaLabel?: string;
  testId?: string;
  className?: string; // size override (Wallets: full row width vs Phase 4 fixed 140px)
}
// Implementation mirrors add-category-column.tsx structure verbatim;
// only differs in className flexibility for row-shape vs column-shape.
```

### RSC fetch pattern (verified Phase 4 spendings page)

```typescript
// Source: VERIFIED apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
import { serverApiFetch } from "@/lib/budget-fetch.server";

export default async function WalletsPage({ params }: PageProps) {
  const { id: budgetId } = await params;
  const res = await serverApiFetch(budgetId, "/wallets");
  const wallets = res.ok ? (await res.json()).wallets ?? [] : [];
  return <WalletsSectionedList budgetId={budgetId} initial={wallets} />;
}
```

## State of the Art

| Old Approach                                                 | Current Approach                                                      | When Changed          | Impact                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2: `PUT /wallets/:id/balance` for balance overwrite    | Phase 5: PATCH /wallets/:id (partial) covers balance via `{ amount }` | This phase            | Old route stays callable; UI prefers PATCH. Leave PUT for backward compat (a worker job uses it, per `setBalance` doc comment).                |
| Phase 2: Wallet `kind`+`scope` columns                       | Phase 1 Plan 01-02: single `wallet_type` enum                         | Already done          | UI never sees legacy `accounts-list.tsx` (stale code uses `kind` — slated for deletion this phase since `<WalletsSectionedList>` replaces it). |
| Phase 4: spendings grid no-hover universal rule (D-PH4-INT1) | Phase 5: wallets explicitly OPT OUT (form-like rows)                  | This phase (D-PH5-W4) | Documented divergence; Spendings grid keeps its rule.                                                                                          |

**Deprecated / outdated:**

- `apps/web/src/components/budgeting/accounts-list.tsx` and `account-actions.tsx` — uses old `kind` + `scope` shape, fetches via `/wallets` but parses `accounts`. **Slated for deletion in this phase** (replaced by `<WalletsSectionedList>`). Confirm no other RSC imports it before deleting.
- `apps/web/src/components/budgeting/account-form.tsx` / `account-form-sheet.tsx` — same legacy. Inline-edit replaces the form-sheet UX entirely; delete in this phase if no other consumer.

## Assumptions Log

| #   | Claim                                                                                                                                  | Section                       | Risk if Wrong                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | WALT-04 currency immutability rule will be **relaxed** for Phase 5 (or Currency cell will be rendered read-only).                      | Open Q1, Pattern 2, Pitfall 3 | If neither: inline-edit on Currency cell returns 422 with hardcoded error. Plan must include the rule change OR mark Currency cell read-only.                         |
| A2  | Phase 4 toast convention is `toast.error("i18n.key")` with raw key (not translated).                                                   | Pitfall 6                     | If wrong: Phase 5 toasts show raw keys; UX nit, easy fix at call site.                                                                                                |
| A3  | The existing `apps/web/src/components/budgeting/accounts-list.tsx` legacy is safe to delete (no consumer).                             | State of the Art              | If wrong: stale import breaks a different page; one-line grep before deletion mitigates.                                                                              |
| A4  | Cross-section drag without in-section reorder is acceptable UX (per Claude's discretion: defer reorder).                               | Pattern 3                     | If users expect drag-to-reorder within a section: minor UX gap; add as separate ticket.                                                                               |
| A5  | `serverApiFetch` already sets `X-Budget-ID` header per T-04-04-07 — Phase 5 just calls it.                                             | Code Examples                 | If wrong: tenant-leak risk; ci-gate test catches this — verified by Phase 4 audit (35/35 threats closed per commit 24d787b).                                          |
| A6  | The existing Phase 2 `GET /budgets/:id/reserves` has no production consumer (safe to change shape).                                    | Pitfall 1                     | If wrong: silent regression. Mitigation: grep `["budget", id, "reserves"]` and `/reserves` paths in `apps/web/**` before changing shape (confirmed empty by my read). |
| A7  | The `tenancy.budgets.default_currency` column is queryable from `withTenantTx` (RLS allows) for the reserve-currency invariant lookup. | Pattern 2                     | If RLS blocks: use `withInfraTx` like `getBudgetCurrency()` in `reserve-balance-repo.ts:30`.                                                                          |

## Open Questions

1. **WALT-04 currency immutability vs D-PH5-W5 inline-edit Currency cell.**
   - What we know: Domain enforces immutability (`wallet.ts:31`). CONTEXT.md D-PH5-W5 says "click any cell becomes editable" — implying Currency is editable.
   - What's unclear: Does "any cell" include Currency, or did the user mean "any of the editable cells (Name, Amount)" while Currency stays display-only per WALT-04?
   - Recommendation: **Plan with Currency as READ-ONLY** (rendered as plain text, no `<InlineEditCell>` wrapper) and note in PR description. If user disagrees during e2e review, follow-up ticket rescinds WALT-04 and adds the mutator. This keeps the immutability invariant intact and ships the most defensive interpretation.

2. **Mismatch totals row visual placement — sticky vs static?**
   - What we know: D-PH5-R1 mandates totals; Claude's Discretion says sticky bottom recommended.
   - What's unclear: Sticky needs the table to be a scroll container — fine on mobile, possibly awkward on desktop short tables.
   - Recommendation: Static footer row on desktop; sticky-bottom on mobile via Tailwind responsive class. Decide during sketch.

3. **In-section reorder — defer or ship?**
   - What we know: Claude's discretion. Not WALT-\* mandated. Needs new `sort_index` column.
   - Recommendation: **Defer** (matches CONTEXT.md "deferred ideas"). Cross-section drag alone is the win.

4. **Should the Actions column placeholder be tappable (open a Phase 7 placeholder dialog) or fully inert?**
   - What we know: D-PH5-R6 says "muted lucide MoreHorizontal" placeholder, ROADMAP success-criterion #5 says "inert this phase".
   - Recommendation: Fully inert (no `onClick`). Removes the Phase 7 coupling temptation.

## Environment Availability

| Dependency                             | Required By                                 | Available                                                           | Version                                   | Fallback                                                 |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `@dnd-kit/core`                        | Drag-between-sections                       | ✓                                                                   | 6.3.1 `[VERIFIED: apps/web/package.json]` | —                                                        |
| `@dnd-kit/sortable`                    | Optional in-section reorder                 | ✓                                                                   | 10.0.0                                    | —                                                        |
| `@tanstack/react-query`                | Mutations + cache                           | ✓                                                                   | ^5                                        | —                                                        |
| `sonner`                               | Toasts                                      | ✓                                                                   | latest                                    | —                                                        |
| `lucide-react`                         | Icons                                       | ✓                                                                   | existing                                  | —                                                        |
| `playwright-bdd`                       | E2E Gherkin                                 | ✓                                                                   | ^8.5.0                                    | —                                                        |
| Postgres (real, for integration tests) | bun:test against /reserves + PATCH /wallets | ✓ (per CLAUDE.md docker-on rule + reserves.test.ts already passing) | —                                         | None — Docker MUST be on per memory hook                 |
| `@hookform/resolvers` + RHF            | Optional for inline-edit                    | ✓                                                                   | latest                                    | Local `useState` is sufficient — RHF not strictly needed |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property                       | Value                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Framework (backend)            | `bun:test` (verified at `apps/api/test/routes/reserves.test.ts`)                                   |
| Framework (frontend component) | `Vitest 4 + happy-dom + RTL` (per CLAUDE.md table; verified test files in `apps/web/test/hooks/`)  |
| Framework (E2E)                | `playwright-bdd ^8.5.0` with Gherkin .feature + Page Objects (per memory hook)                     |
| Config                         | `bunfig.toml` for bun:test, `apps/web/vitest.config.ts` for Vitest, `playwright.config.ts` for E2E |
| Quick run                      | `make test` (bun:test backend), `cd apps/web && bun run test` (Vitest)                             |
| Full suite                     | `make test && make test-e2e && make ci-gate`                                                       |

### Phase Requirements → Test Map

| Req ID                     | Behavior                                                   | Test Type               | Automated Command                                                                         | File Exists?         |
| -------------------------- | ---------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| RSRV-01                    | Endpoint returns rows + totals shape                       | integration             | `bun test apps/api/test/routes/reserves.test.ts` (EXTEND)                                 | ✅ exists, extend    |
| RSRV-02..05                | Phase 2 VIEW already covers                                | —                       | (regression only)                                                                         | —                    |
| RSRV-06                    | Share math correctness, multi-cat, edge zeros              | integration             | new cases in `reserves.test.ts`                                                           | ❌ Wave 0: add cases |
| RSRV-07                    | New category shows balance 0, share `—`                    | component               | `apps/web/test/components/reserves-table-row.test.tsx`                                    | ❌ Wave 0: new       |
| WALT-01                    | List endpoint returns wallets                              | integration             | `bun test apps/api/test/routes/wallets.test.ts`                                           | ✅ exists            |
| WALT-02                    | Drag drops set wallet_type                                 | integration             | new PATCH /wallets/:id test with `{walletType: 'RESERVE'}`                                | ❌ Wave 0: new       |
| WALT-03                    | Tab + blur saves                                           | component               | `apps/web/test/components/inline-edit-cell.test.tsx`                                      | ❌ Wave 0: new       |
| WALT-04                    | + Add spawns row with Name focus                           | component               | `apps/web/test/components/dashed-add-button.test.tsx` + `wallets-sectioned-list.test.tsx` | ❌ Wave 0: new       |
| WALT-05                    | Trash → confirm → archive                                  | E2E                     | `tests/e2e/features/wallets/delete.feature`                                               | ❌ Wave 0: new       |
| WALT-06                    | Type labels display only                                   | (covered by WALT-01/02) | —                                                                                         | —                    |
| WALT-07                    | Wallet balance not affected by transactions                | integration             | regression — no change                                                                    | ✅ covered Phase 2   |
| RSRV-06 + WALT-\*          | Edit wallet amount → reserves share refetches              | E2E                     | `tests/e2e/features/wallets/cross-tab-invalidation.feature`                               | ❌ Wave 0: new       |
| Reserve-currency invariant | Drag non-budget-cur wallet to Reserve → 422 + snap back    | integration + E2E       | new cases in PATCH test + `tests/e2e/features/wallets/reserve-currency-rejected.feature`  | ❌ Wave 0: new       |
| Tenant gate                | Cross-tenant GET /reserves → 403; PATCH cross-tenant → 404 | integration             | new cases in `reserves.test.ts` + `wallets.test.ts`                                       | ❌ Wave 0: new       |

### Sampling Rate

- **Per task commit:** `bun test apps/api/test/routes/reserves.test.ts apps/api/test/routes/wallets.test.ts` (~5–10s)
- **Per wave merge:** `make test && cd apps/web && bun run test`
- **Phase gate:** Full suite + `make ci-gate` + `make test-e2e` green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `apps/api/test/routes/reserves.test.ts` — extend with: totals row shape, share math non-zero, share math `Σ=0` → null, archived wallet excluded, cross-tenant 403.
- [ ] `apps/api/test/routes/wallets.test.ts` — extend with: PATCH name, PATCH amount, PATCH walletType (cross-section), PATCH reserve-currency-mismatch 422, cross-tenant PATCH → 404.
- [ ] `apps/web/test/components/inline-edit-cell.test.tsx` — new (click-edit, blur-save, error rollback).
- [ ] `apps/web/test/components/dashed-add-button.test.tsx` — new.
- [ ] `apps/web/test/components/wallets-sectioned-list.test.tsx` — new (drag-end handler with mocked sensor).
- [ ] `apps/web/test/components/reserves-table-row.test.tsx` — new (em-dash logic).
- [ ] `apps/web/test/hooks/use-update-wallet.test.tsx` — new (optimistic + rollback + cross-invalidation).
- [ ] `tests/e2e/features/wallets/add-edit-drag-delete.feature` — new (golden path).
- [ ] `tests/e2e/features/wallets/reserve-currency-rejected.feature` — new (error UX).
- [ ] `tests/e2e/features/reserves/share-math-and-zero-state.feature` — new.
- [ ] `tests/e2e/pages/WalletsPage.ts`, `tests/e2e/pages/ReservesPage.ts` — new Page Objects.
- [ ] No framework install needed — all in place.

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                             |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Existing Better Auth session middleware (`c.get("session")`); reject 401 if absent (verified pattern in `budgets.ts:275-277`)                                                                |
| V3 Session Management | yes     | Better Auth (existing); no Phase 5 changes                                                                                                                                                   |
| V4 Access Control     | yes     | (a) `budgetId !== tenantId` 403 gate on `/reserves` and PATCH /wallets/:id (Phase 4 T-04-02-08 pattern). (b) RLS via `pgPolicy` on `budgeting.wallets` (verified `wallets-schema.ts:34-41`). |
| V5 Input Validation   | yes     | `zod` schemas in `contracts/api.ts` — `updateWalletSchema` + reserve-currency-constraint refinement. zValidator on every route.                                                              |
| V6 Cryptography       | no      | No new secrets, no encryption changes                                                                                                                                                        |
| V7 Errors & Logging   | yes     | `serverError(c, code, err)` wrapper (existing) writes pino structured log; never leak `err.message` to client                                                                                |
| V8 Data Protection    | yes     | Audit row on every wallet mutation (verified `wallet-repo.ts:53-65`); `actor_user_id` recorded                                                                                               |
| V12 File Handling     | no      | No file upload                                                                                                                                                                               |
| V13 API & Web Service | yes     | Hono routes; idempotency key on PATCH per Phase 4 convention (`generateIdempotencyKey()` in `use-update-transaction.ts:36`)                                                                  |

### Known Threat Patterns for Hono + Drizzle + multi-tenant

| Pattern                                                  | STRIDE                 | Standard Mitigation                                                                                                                                                                  |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cross-tenant read of another budget's reserves           | Information Disclosure | `budgetId !== tenantId` 403 gate + RLS double-check (`tenant_id = ANY(app.tenant_ids)` policy)                                                                                       |
| Cross-tenant PATCH (write to other wallet)               | Tampering              | Same gate + RLS; integration test asserts 404 with mismatched header                                                                                                                 |
| RESERVE wallet currency bypass                           | Tampering              | Domain invariant in `update-wallet.ts` use case; rejected with 422; integration test asserts each mutation path (POST + PATCH name+currency, PATCH walletType, PATCH currency alone) |
| Race: optimistic delete + concurrent transaction confirm | Tampering              | Soft-archive only (no cascade); transactions table has no `wallet_id` FK — no race                                                                                                   |
| Drag-spam DOS (rapid PATCH /wallets/:id)                 | DoS                    | TanStack Query mutation queue (no concurrent same-key); rate-limit middleware (assumed existing — TODO verify)                                                                       |
| Idempotency-Key replay                                   | Tampering              | `generateIdempotencyKey()` per request (Phase 4 pattern); server-side dedupe (assumed existing — TODO verify)                                                                        |
| XSS via wallet name                                      | XSS (S in STRIDE)      | React auto-escapes; zod `min(1).max(120)` on input (no length-based attack)                                                                                                          |
| Insecure direct object reference on wallet id            | A4 Insecure DOR        | RLS — query with mismatched tenant returns empty rowset; route returns 404                                                                                                           |

**Security threat-model gate (Phase 4 audit pattern T-04-\*) MUST cover:**

- T-05-01: `GET /budgets/:id/reserves` with `budgetId !== tenantId` → 403
- T-05-02: `PATCH /wallets/:id` with `walletId` belonging to different tenant → 404
- T-05-03: `PATCH /wallets/:id` with `{walletType: 'RESERVE'}` when currency ≠ budget currency → 422
- T-05-04: `PATCH /wallets/:id` with `{currency: NEW}` on an existing RESERVE wallet where NEW ≠ budget currency → 422
- T-05-05: `POST /wallets` with `{walletType: 'RESERVE', currency: NON_BUDGET}` → 422
- T-05-06: Drag → optimistic update → server rejects → row snaps back (no stale state)
- T-05-07: Audit row written on every wallet mutation (verify in writeAudit assertion)

## Sources

### Primary (HIGH confidence — codebase verified)

- `apps/api/src/routes/wallets.ts` (read in full) — current routes: POST, GET list, GET :id, POST archive, PUT balance. **No PATCH**.
- `apps/api/src/routes/budgets.ts:273-294` — existing minimal `GET /:id/reserves` to be extended.
- `apps/api/src/routes/spendings-summary.ts` — composed-read endpoint pattern + tenant gate.
- `apps/api/src/routes/categories.ts:123-160` — sort-order PATCH pattern (mirror for wallet update).
- `apps/api/test/routes/reserves.test.ts` + `wallets.test.ts` — existing test patterns + fixture helpers.
- `packages/budgeting/src/domain/wallet.ts` — confirmed: no rename/setType/setAmount; canChangeCurrency always errors (WALT-04).
- `packages/budgeting/src/ports/wallet-repo.ts` — confirmed: no `update()` method; must add.
- `packages/budgeting/src/adapters/persistence/wallet-repo.ts` — read in full; audit + outbox pattern.
- `packages/budgeting/src/adapters/persistence/wallets-schema.ts` — RLS policy + CHECK constraint on wallet_type + archived_at column.
- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — reads `category_reserve_balance` VIEW; ready for reuse.
- `packages/budgeting/src/adapters/persistence/spendings-summary-repo.ts` — pattern for budget metadata read.
- `packages/budgeting/src/contracts/api.ts` — existing zod schemas; `updateWalletSchema` to be added.
- `packages/budgeting/src/contracts/factory.ts` — DI wiring pattern.
- `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx:125-159` — verified sensor config + drag handler.
- `apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx` — verified dashed-add-button pattern.
- `apps/web/src/hooks/use-reorder-categories.ts` — verified optimistic + rollback pattern.
- `apps/web/src/hooks/use-update-transaction.ts` — verified inline-edit mutation pattern + idempotency.
- `apps/web/src/components/budgeting/bdp-tabs.tsx` — verified i18n nested namespace (`bdp.tab.{slug}.label`).
- `apps/web/src/app/[locale]/(app)/budgets/[id]/{reserves,wallets,spendings}/page.tsx` — verified RSC placeholders + spendings working pattern.
- `apps/web/src/components/ui/{alert-dialog,sonner,table,tabs}.tsx` — verified UI primitives available.
- `apps/web/messages/en.json` — verified i18n key shape for `bdp.tab.{reserves,wallets}.*`.
- `apps/web/package.json` — verified all required deps installed at the cited versions.
- `tests/e2e/features/spendings/*.feature` — verified BDD Gherkin layout for Page Object reuse.
- `.planning/REQUIREMENTS.md` — verified RSRV/WALT/RSCM IDs.
- `.planning/ROADMAP.md:119-133` — verified Phase 5 goal + success criteria.
- `Makefile` — verified `make test`, `make test-e2e`, `make ci-gate` targets.

### Secondary (MEDIUM confidence)

- `graphify-out/GRAPH_REPORT.md` — confirms wallet-repo is connected only to dep-cruiser config; no surprise consumers.

### Tertiary (LOW confidence — flagged for validation)

- Toast i18n behavior (Pitfall 6 / A2) — inferred from one call site; verify on first impl.
- Rate-limit middleware existence (Security §) — assumed from Phase 4 audit closure but not directly read.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every version verified in `package.json`; no new deps.
- Architecture: HIGH — RSC + client island pattern is identical to Phase 4 (working code in repo).
- Pitfalls: HIGH — every pitfall comes from a specific file read (line numbers cited).
- Reserve-currency invariant location: HIGH — `tenancy.budgets.default_currency` is reachable; pattern in `reserve-balance-repo.ts:30`.
- WALT-04 vs D-PH5-W5 reconciliation: **MEDIUM** — recommendation given but needs user confirmation (Open Q1).
- Stale code deletion safety (`accounts-list.tsx`): MEDIUM — grep before delete recommended (Assumption A3).

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (30 days — stable stack, no fast-moving libraries in use).
