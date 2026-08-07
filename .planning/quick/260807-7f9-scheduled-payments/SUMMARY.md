---
id: 260807-7f9
slug: scheduled-payments
date: 2026-08-07
status: incomplete
---

# Summary — phases 1 and 2 shipped, 3 to 5 outstanding

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

## Outstanding

3. **The chart** — "Upcoming scheduled payments, by month", today → the latest
   `next_due_date` across active payments, replacing the monthly-rate view, with
   the reserve-fit forward leg taking the same horizon instead of a fixed 12.
4. **One-time income** — a frequency on the income form with a date picker that
   refuses past dates, the income removed once the date passes, reflected in
   every Overview chart, banner and metric.
5. **One-time payment lifecycle in the list** — a fired payment currently
   vanishes (it is deactivated, and the list only asks for active rows). It must
   sink to the bottom and read as disabled, which needs the list to return
   retired payments — and that needs deletion to become distinguishable from
   retirement, since today both are just `active = false`. Plus: no active
   toggle in the form, editing the date moves the draft, and a payment whose
   draft is already confirmed is read-only.
