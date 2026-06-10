# Reserves Rewrite — Model Spec & Golden Fixture

**Status:** model validated against the golden table (all 29 rows reproduce exactly). Supersedes the
old reserve model (expected/actual two-value, reserve-wallet-as-source, greedy cross-category pool).

## Why rewrite

Old design let the user enter a reserve-wallet amount and used THAT as the source of reserve money →
double-spending + invalid states. It also tracked two values per category (expected + actual). New
model: ONE reserve per category; a system-derived internal wallet is the only source; the user-defined
wallet amount only drives a reconciliation surplus.

## Core concepts

- **Per-category reserve** — money set aside per spending category. Grows from monthly underspend
  (accrual at month close) and from manual user adjustments. Spent automatically to cover that
  category's overspend.
- **Internal reserve wallet** = Σ of every category's _available_ reserve. System-managed, hidden,
  the ONLY source of reserve money: drawn down when reserve is used, raised when reserve accrues or is
  adjusted up.
- **User-defined reserve wallet amount** = what the user says they hold (Σ balances of `RESERVE`-type
  wallets). Used ONLY to compute surplus, NEVER as a source/cap for reserve money.
- **Surplus** = userDefined − internal. When ≠ 0 → one budget-level reconciliation task
  (negative → "top up", positive → "withdraw").

## Per-category state & invariants

Each category carries a running pair, derived by **replaying its ordered event history**:

```
R = available reserve     (the "reserve" column shown to the user)
U = used reserve          (reserve already consumed by overspend)
capacity = R + U          (only changes on adjust / accrual / exclude / delete)

effLimit = cushionModeOn ? category.cushionLimit : category.normalLimit
overage   = max(spent − effLimit, 0)      // spent = Σ this category's transactions in the month
left      = max(effLimit − spent, 0)      // unified: overage AND left both keyed off effLimit
overspent = overage − U                   // hard invariant: U + overspent = overage
```

## Operations (the engine)

```
1. overage increases by Δ   (add/raise txn, cut limit, cushion stricter):
       draw = min(Δ, R);  R -= draw;  U += draw          // remainder (Δ − draw) becomes overspent

2. overage decreases by Δ   (remove/lower txn, raise limit, cushion looser):
       dec = Δ
       fromOverspent = min(dec, overspent)               // cut overspent first
       remaining     = dec − fromOverspent
       U -= remaining;  R += remaining                    // return used → available

3. set reserve to X         (manual adjust; X ≥ 0):
       d = X − R
       if d >= 0:  cover = min(d, overspent);  U += cover;  R += (d − cover)   // cover overspent first
       else:       R += d                                                       // (R becomes X)

4. month-close accrual:     reserve += left               // applied exactly as op 3 with X = R + left
                                                           // (covers outstanding overspent first)
```

Globals each read:

```
internal = Σ over active (non-excluded, non-archived) categories of R
surplus  = userDefined − internal      // userDefined = Σ RESERVE-wallet balances
emit RESERVE reconcile task iff surplus != 0   (negative → top up, positive → withdraw)
```

## Architecture decisions (locked)

| #   | Decision             | Choice                                                                                                                                                                                                                                                     |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Canonical state      | **Replay-on-read.** R/U derived fresh each read from the ordered event history. Snapshot cache may layer on later without changing results.                                                                                                                |
| B   | Existing data/schema | **Reset & rebuild.** Drop `reserve_actual_cents`, the `category_reserve_balance` expected VIEW, wallet-as-source/greedy logic. Keep `category_reserve_adjustments` (append-only signed deltas).                                                            |
| C   | Wallet mapping       | userDefined = Σ `RESERVE`-wallet balances. Internal = derived ΣR, never a row. "Disable archives internal wallet" = the `reserves_enabled` flag.                                                                                                           |
| D   | In-flight code       | **Build on current files in place** (evolve toward this model; delete genuinely dead logic). No wholesale git-revert. Preserve non-reserve `tasks-redesign` changes.                                                                                       |
| E   | Adjustments          | Stored as signed **deltas** (`delta = Xtarget − currentR` computed at write). Replay applies deltas in order. Editing a past txn re-derives R; the delta stays fixed.                                                                                      |
| F   | Reserve scope        | ONE running R/U per category, cumulative across all months. `overage`/`left`/`used`/`overspent` are per-month for display; R carries forward chronologically.                                                                                              |
| G   | Accrual              | At each **closed** month's close, `reserve += left` (left keyed off that month's effLimit). The current/open month does NOT accrue.                                                                                                                        |
| H   | `left` under cushion | Uses the **effective** limit (cushion when cushion-mode on). overage and left share one threshold.                                                                                                                                                         |
| I   | Retroactive coverage | **YES** — raising reserve (adjust or accrual) covers outstanding overspent across ALL months (oldest-first), not just the open month. _(ordering = oldest-first; confirm at plan time.)_                                                                   |
| J   | Category deletion    | Both modes drop the category's reserve going forward → its R leaves internal, surplus recalcs; it stops drawing/accruing. `current_future`: past closed months display historical read-only. `all`: archived/hidden.                                       |
| K   | Disable / re-enable  | Disable = `reserves_enabled=false`: reads show every category overspent = full overage (used→overspent), R/internal/tab hidden, calc stops; underlying data untouched. Re-enable = replay full history → identical pre-disable R/U/overspent (idempotent). |

## Per-category independence

No cross-category spill. Adjusting/excluding/deleting one category's reserve never refills siblings.
The old greedy `reserve-allocator` (refillUnderfunded / deductFromBottom / share %) is **dead**.

## Golden fixture (executable — every row reproduces exactly)

Single open month, cushion limits: Grocery 300, Housing 250 (note: Housing cushion < normal).
Each row is the exact expected state AFTER that action. Columns:
`G_limit, G_cushion, G_overspent, G_used, G_left, H_limit, H_cushion, H_overspent, H_used, H_left, G_reserve, H_reserve, internal, userDefined, surplus, cushion`

```csv
action,G_limit,G_cushion,G_overspent,G_used,G_left,H_limit,H_cushion,H_overspent,H_used,H_left,G_reserve,H_reserve,internal,userDefined,surplus,cushion
starting point,300,300,0,0,300,500,250,0,0,500,0,0,0,0,0,off
set userDefined 1000,300,300,0,0,300,500,250,0,0,500,0,0,0,1000,1000,off
adjust Housing reserve to 300,300,300,0,0,300,500,250,0,0,500,0,300,300,1000,700,off
adjust Housing reserve to 250,300,300,0,0,300,500,250,0,0,500,0,250,250,1000,750,off
adjust Grocery reserve to 100,300,300,0,0,300,500,250,0,0,500,100,250,350,1000,650,off
adjust Grocery reserve to 1200,300,300,0,0,300,500,250,0,0,500,1200,250,1450,1000,-450,off
adjust Housing reserve to 0,300,300,0,0,300,500,250,0,0,500,1200,0,1200,1000,-200,off
set userDefined 3000,300,300,0,0,300,500,250,0,0,500,1200,0,1200,3000,1800,off
set userDefined 0,300,300,0,0,300,500,250,0,0,500,1200,0,1200,0,-1200,off
add Grocery txn 100,300,300,0,0,200,500,250,0,0,500,1200,0,1200,0,-1200,off
add Grocery txn 500,300,300,0,300,0,500,250,0,0,500,900,0,900,0,-900,off
set userDefined 3000,300,300,0,300,0,500,250,0,0,500,900,0,900,3000,2100,off
add Grocery txn 1000,300,300,100,1200,0,500,250,0,0,500,0,0,0,3000,3000,off
remove Grocery txn 500,300,300,0,800,0,500,250,0,0,500,400,0,400,3000,2600,off
add Housing txn 100,300,300,0,800,0,500,250,0,0,400,400,0,400,3000,2600,off
add Housing txn 600,300,300,0,800,0,500,250,200,0,0,400,0,400,3000,2600,off
adjust Housing reserve to 400,300,300,0,800,0,500,250,0,200,0,400,200,600,3000,2400,off
add Grocery txn 700,300,300,300,1200,0,500,250,0,200,0,0,200,200,3000,2800,off
add Housing txn 900,300,300,300,1200,0,500,250,700,400,0,0,0,0,3000,3000,off
edit Grocery txn 100 to 200,300,300,400,1200,0,500,250,700,400,0,0,0,0,3000,3000,off
adjust Grocery reserve to 1500,300,300,0,1600,0,500,250,700,400,0,1100,0,1100,3000,1900,off
edit Grocery txn 200 to 100,300,300,0,1500,0,500,250,700,400,0,1200,0,1200,3000,1800,off
cushion off to on,300,300,0,1500,0,500,250,950,400,0,1200,0,1200,3000,1800,on
cushion on to off,300,300,0,1500,0,500,250,700,400,0,1200,0,1200,3000,1800,off
adjust Housing reserve to 1000,300,300,0,1500,0,500,250,0,1100,0,1200,300,1500,3000,1500,off
cushion off to on,300,300,0,1500,0,500,250,0,1350,0,1200,50,1250,3000,1750,on
cushion on to off,300,300,0,1500,0,500,250,0,1100,0,1200,300,1500,3000,1500,off
Grocery limit 300 to 400,400,300,0,1400,0,500,250,0,1100,0,1300,300,1600,3000,1400,off
Housing limit 500 to 1000,400,300,0,1400,0,1000,250,0,600,0,1300,800,2100,3000,900,off
```

(All amounts are major units in the fixture; implementation works in integer cents.)

## Beyond the golden table (TDD with dedicated fixtures)

The golden table is a single open month → it does NOT exercise accrual, multi-month carry, retroactive
coverage, or disable/re-enable. Those get their own tests honoring decisions G–K:

- **Multi-month + accrual**: closed-month `left` accrues into the running reserve; later months draw it.
- **Retroactive coverage**: raising reserve covers older closed-month overspent (oldest-first).
- **Disable→re-enable idempotency**: simulate several months with usage + adjustments → disable
  (assert every used→overspent, internal hidden) → re-enable (assert R/U/overspent identical to
  pre-disable).

## Component plan (build-on-current, delete dead)

- **Domain** — replace greedy `reserve-allocator.ts` with a pure **`reserve-engine.ts`**: chronological
  event fold → per-(category,month) `{overage,used,overspent,left}` + running R + internal + surplus.
- **Application** — `get-reserve-positions.ts` becomes the replay orchestrator (loads spend-by-cat-by-
  month, limit history, cushion history, adjustment deltas, archived flags → engine). `get-reserves-
summary` / `get-spendings-summary` consume it. `adjust-category-reserve` → compute delta + append.
  `set-wallet-balance` / `update-wallet` → set userDefined only (no allocation). `recompute-reserve-
topup-task` → surplus task. Delete `applyExpectedChange/refill/deduct` paths.
- **Persistence** — drop `reserve_actual_cents`, the expected VIEW, greedy bits. Keep
  `category_reserve_adjustments`, `reserves_enabled`, archive cols, `budget_mode_history`, RESERVE
  wallets. Need `spendByCategoryByMonth` (exists).
- **Contracts/API** — reshape `ReservesSummaryDto`: per-category `{reserve, used, overspent}`,
  `internal`, `userDefined`, `surplus`+direction. Drop expected/actual/walletShare%/mismatch.
- **UI** — Reserve tab: single reserve value + used + surplus banner (top-up/withdraw). Spendings grid:
  used + overspent per cat/month. Remove expected/actual/share%/mismatch-chip. Keep deletion modes,
  cushion toggle, reserves enable/disable wiring.

## Sequencing (each its own red→green commit)

1. Pure `reserve-engine.ts` + golden-table test (parse this CSV, assert every cell) — keystone.
2. Multi-month/accrual + retroactive + disable/re-enable domain tests.
3. Persistence reset (migration: drop dead cols/VIEW) + event-loader repo methods.
4. `get-reserve-positions` replay orchestrator + summary/spendings consumers.
5. Adjust / wallet / deletion / disable application use-cases.
6. Contracts + API routes reshape.
7. UI reshape + E2E (@tasks-redesign reserves).
8. Final verify vs golden table + round-trip; delete orphaned code; `graphify update`.
