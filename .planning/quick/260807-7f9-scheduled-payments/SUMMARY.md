---
id: 260807-7f9
slug: scheduled-payments
date: 2026-08-07
status: complete
---

# Summary — all five phases shipped

## Phase 1 — the rename (commit `53817182`, 176 files)

Migration 0077 renames the table, both policies, four CHECK constraints, two
indexes, `expense_ledger.scheduled_payment_id`, its FK and its partial unique
index — all `RENAME`, never drop-and-recreate. `post-migration.sql` re-asserts
every one by name on each deploy, so it moved too. Then schema, ports, repos,
services, worker, route (`/budgets/:id/scheduled-payments`, no alias), web
components, query keys, and i18n in all three locales.

The pg-boss queue keeps the name `recurring-engine`: renaming it orphans queued
jobs and the household never sees it.

**Verified**: 7 red → 7 green on the new DB rename test; the renamed domain,
worker, api and web suites green (127 / 70 / 48); tsc clean on api, worker and
web; eslint clean; live against budget-dev — old path 404s, new path creates and
lists, and the section reads "Scheduled payments" in English and "Zaplanowane
płatności" for a Polish account.

## Phase 2 — the ONCE cadence (commit `442a9e3a`)

A one-time payment is **a payment whose deadline is its own date**, so the
end-date machinery from 0069 carries the whole lifecycle: the generation loop
stops at `end_date` and the engine retires the row. Neither the worker nor the
create-time catch-up needed a branch. Migration 0078 widens only the cadence
CHECK — the other three already tolerate a row with no anchor, weekday or month.

Reserve sizing counts it: a one-time payment lands on TOP of its month, the way
a yearly renewal does, because that month still has its ordinary groceries
underneath.

**Verified** (red first every time): 4 domain cadence cases, 3 DB cases, 5 API
cases against real Postgres (past date → exactly one draft then auto-retire;
future date → live and undrafted; a client-sent end_date overridden), 4
projection cases, 2 reserve-fit cases, 6 form cases — plus live on budget-dev:
picking "One time" removes the Last-date field and leaves a plain Date.

Also corrected a source-pin test that commit `bd19467c` broke (`colorKey` moved
to `colorPct` and the assertion still named `pct`). That commit was reported as
verified on the strength of the overview suites; the charts suite was the one
that caught it.

## Phase 5 — retired is not deleted (commit `e64b2d84`)

A one-time payment retires itself once its date passes, and the list only asked
for active rows, so it vanished. Showing every inactive row would have
resurrected everything ever deleted, because deletion and retirement were the
same state. Migration 0079 adds `deleted_at` — retirement is something the
payment did, deletion is something a person did. Retired rows sort last at half
opacity; a payment whose draft is confirmed loses its edit button (the money
moved); moving a one-time payment's date moves its deadline with it.

**Verified**: 3 API cases red first, 25 green after; 6 list/sorting cases; live —
a retired payment stays listed with `active:false`, a deleted one is gone.

## Phase 3 — the chart and the reserve horizon (commit `39c7459f`)

"Upcoming scheduled payments, by month": today → the furthest next-due, real
calendar months on the axis, each payment in the month it truly falls in. The
rate view (a yearly renewal ÷ 12) is gone. Reserve-fit's forward leg takes the
same horizon; twelve months is now the floor, not the ceiling.

**Verified**: 12 cases on the new `upcoming-schedule` domain module, 6 on the
month labels, 2 reserve-fit horizon cases (red first: 12000 vs 300000), the api
route test rewritten to the new shape; live — the series ends exactly on a
one-time payment 500 days out and carries money in that month alone.

## Phase 4 — one-time income (commit `bc61abc2`)

Migration 0080 adds `once_date`, required for ONCE and forbidden otherwise. The
form swaps the pay-day fields for a date picker with `min=today`; the API refuses
a past date. "Removed once the date passes" is done on READ, so the numbers are
right the moment the date turns with nothing racing the calendar. Every figure
now asks about a MONTH: a one-time income counts in full in the month it arrives
and for nothing in any other.

Fixed a live bug found on the way: `enumerateOccurrences` walked ONCE by its
one-day step, so the one-time payment shipped in `442a9e3a` drew as a *daily*
payment across the whole cash-flow window.

**Verified**: 10 domain cases, 3 enumeration cases (red: 276 daily entries), 6
API cases against real Postgres, 5 form cases; full web suite 2011 green; live —
the date is accepted, a past one is refused 400, and a past-dated row is absent
from the list.

## Known gaps

- A one-time payment moved to a PAST date gets its draft from the nightly engine
  rather than instantly; the inline catch-up lives in the create path and has not
  been extracted.
- Pre-existing and untouched: two `unarchiveCategory` assertion failures and one
  `budget-wealth-snapshot-3h` failure, all of which fail without these changes.
