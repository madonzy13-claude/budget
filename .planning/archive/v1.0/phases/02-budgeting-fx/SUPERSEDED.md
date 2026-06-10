# Phase 02 — SUPERSEDED by Phase 03 (Budget Restructure)

**Status of phase 02 work:** code merged and verified (VERIFICATION.md 28/28 requirements passed). Architecture, data model, and UX choices documented in 02-\* plans are NOT being rolled back — they are being **rebuilt on top of** in phase 03 to match a new product direction agreed during the 2026-05-11 design review.

This file exists so anyone reading the 02-\* plans understands which decisions still hold and which have been replaced.

---

## What still holds from phase 02

- Hexagonal/DDD layering (`domain/`, `application/`, `adapters/`).
- Drizzle + RLS + tenant guard middleware (`apps/api/src/middleware/tenant-guard.ts`).
- `Money` value object at adapter boundary.
- Frankfurter FX adapter (`packages/budgeting/src/adapters/fx/frankfurter.ts`) — convert at txn date, store original + converted.
- Append-only ledger primitive + audit history infra.
- pg-boss workers (FX daily fetch, future month-end sweep).
- Better Auth + organizations plugin for shared workspaces (now renamed "budgets").
- next-intl with EN/PL/UK message catalogs.
- E2E via playwright-bdd Gherkin + Page Objects.
- 80% domain test coverage gate (`bunfig.toml`).

## What is being replaced

| Phase 02 artifact                                                  | Replaced by (phase 03)                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `workspace` entity + URL `/workspaces/[id]/...`                    | `budget` entity + URL `/budgets/[id]/...`                                                                          |
| `account` entity (CHECKING/SAVINGS/CASH kinds)                     | `wallet` entity (type: spendings/cushion/reserve, label-only)                                                      |
| `transaction.toAccountId` (TRANSFER)                               | dropped; txns purely categorical                                                                                   |
| `transaction.kind` (EXPENSE/INCOME/TRANSFER)                       | dropped; only EXPENSE remains                                                                                      |
| `transaction.accountId` (wallet linkage)                           | dropped; wallets are manual snapshots only                                                                         |
| `category_limits` SCD-2 table — single planned value per category  | category has **planned + cushion** values (two), still SCD-2 versioned                                             |
| Vertical sidebar nav in workspace detail                           | Pill-style horizontal tabs, sticky on scroll                                                                       |
| `/transactions`, `/accounts`, `/budget`, `/recurring` global pages | Folded into single budget detail page tabs: Spendings / Reserves / Wallets / Settings                              |
| Transaction search bar + filter chips                              | Dropped; grid is current-month-only                                                                                |
| Edit-history panel (`edit-history-panel.tsx`)                      | Dropped; audit stays DB-only                                                                                       |
| `pending-drafts-inbox` separate UI                                 | Drafts surface as highlighted rows in Spendings grid                                                               |
| `/workspaces` list page                                            | Replaced by top-nav dropdown switcher (Personal/Shared groups + `+` aside button)                                  |
| `accounts-list` card grid                                          | Wallets tab inline-editable rows (always-edit, auto-save on blur)                                                  |
| Category limit editor as dedicated modal                           | Folded into category pen-icon side slider (planned + cushion in one form)                                          |
| "active workspace" in session/URL header                           | Budget id in URL path `/budgets/[id]/...`; budget context derived from path                                        |
| Income tracking (transaction kind INCOME)                          | Removed; wallet balances updated manually                                                                          |
| Reserve domain "month-end sweep" prototype                         | Reserves auto-computed real-time: cumulative `(active_budget − spent)` past months, floor 0, per-category isolated |
| Cushion domain (planned future phase 3)                            | Folded into phase 03 as workspace-wide toggle that swaps `planned`→`cushion` globally                              |
| Transaction capture form (kind tabs, wallet, transfer target)      | Stripped to: date, category, amount, currency (optional override), note                                            |
| `/categories` global page                                          | Folded into Spendings grid (column header + `+` dashed column)                                                     |

## Dev DB will be nuked

Phase 03 ships with destructive schema migration. Existing dev/test data discarded. No data migration script. Acceptable because no production deployment yet.

## Roadmap impact

Original roadmap phase 3 ("Reserve, Investments, Cushion — three parallel contexts") is **partially merged** into the new phase 03:

- **Reserves** → built as part of phase 03 (auto-compute model, not month-end sweep).
- **Cushion** → built as part of phase 03 (workspace toggle).
- **Investments** → defers to a later phase, scope unchanged.

Renumbering of legacy phases 3–6 is handled by `/gsd-new-milestone` when phase 03 is formally created.

## See

- `.planning/phases/03-budget-restructure/SPEC.md` — durable decision record for the new architecture.
- 2026-05-11 brainstorming session (conversational; not persisted as separate doc).
