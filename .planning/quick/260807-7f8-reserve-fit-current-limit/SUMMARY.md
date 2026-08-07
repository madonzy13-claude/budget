---
id: 260807-7f8
slug: reserve-fit-current-limit
date: 2026-08-07
status: complete
---

# Summary

Reserve sizing walked each past month against the limit that month happened to
have. Those limits are retired; the buffer is held for what comes next. Every
past month is now judged against the limit in force today.

## Changed

- `packages/budgeting/src/application/get-reserve-fit.ts` — one `currentLimit`
  per category (the running month's, else the latest the range saw), used for
  every month of the backward walk. The forward leg's `latestLimit` now falls
  out of the same value. A category with no current limit keeps its own history:
  reading "no limit" as a limit of zero would turn all its spend into overage.

## Verified

- `bun test packages/budgeting/test/overview/get-reserve-fit.test.ts` — 2 fail
  before (`needed 12000`, expected `0`), 26 pass / 0 fail after. Four new cases:
  a limit raised today unmakes the overage months it was raised past; overage
  count and worst-month follow; months_counted is untouched; a range ending
  before today falls back to the last limit it saw, applied to every month.
- `packages/budgeting/test/domain/reserve-fit.test.ts` and the DB-backed
  `reserve-fit-repo.test.ts` (under `infisical run --env=dev`) — 10 pass / 0 fail.
- `apps/api/test/routes/reserve-fit.test.ts` — 10 pass / 0 fail.
- `tsc --noEmit -p packages/budgeting` — no errors in the touched files
  (`share-overrides-sum-trigger.test.ts` carries two pre-existing Result-narrowing
  errors, untouched).
- api rebuilt and healthy.

## Arithmetic check against live data

Food & Home (`5ae7c82a`), 1Y = 2025-09-01 → today, so eleven closed months:

| | old limit 50 | current limit 110 |
|---|---|---|
| Sep–May net | +407 banked | +947 banked |
| Jun (406 spent) | −356 → +51 | −296 → +651 |
| Jul (762.63 spent) | −712.63 → **−661.63** | −652.63 → **−1.63** |

Held is 0, so the chart drew −662 zł. It should now read about −2 zł. Mean spend
across those months is 110.15/mo — the 110 limit is right, and the buffer sized
for the retired 50 was the wrong answer to the wrong question.

## Known limit (user's call, out of scope)

The trough is still order-dependent inside the window: move the same June/July
lumps to the front and the same year asks for ~949 zł instead of ~2 zł. A
worst-rotation walk fixes that; the user chose the current-limit change alone.
