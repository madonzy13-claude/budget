---
id: 260807-7f8
slug: reserve-fit-current-limit
date: 2026-08-07
mode: quick
---

# Quick: size the reserve against today's limit, not yesterday's

## Symptom

"Is each reserve the right size?" asked Food & Home to hold 662 zł more than it
does, off the back of one heavy month. The household had already raised that
category's limit from 50 to 110 — which is almost exactly its mean spend.

## Root cause

`get-reserve-fit.ts` walked each month against the limit **that month** had
(`limitByCell`), while the forward leg used `latestLimit`. Reconstructed from
the live DB (category `5ae7c82a`, range 1Y):

```
limit 50/mo · Sep–May quiet (+407 banked) · Jun 406 (−356) · Jul 762.63 (−712.63)
walk troughs at −661.63  →  needed 662, held 0, gap −662   ← what the chart drew
```

Same months against the current 110 limit:

```
+110 +110 +103 +104 +110 +110 +80 +110 +110 → 947 · Jun −296 → 651 · Jul −652.63
trough −1.63  →  needed ~2 zł
```

The buffer is held for what comes next, and what comes next is metered by the
limit in force now. Judging history at retired limits sizes a buffer for a
budget nobody runs any more.

## Tasks

1. **[test]** Failing cases in `packages/budgeting/test/overview/get-reserve-fit.test.ts`:
   a limit raised in the running month makes the same history ask for nothing;
   overage months and worst-month follow; a range ending before today falls back
   to the last limit the range saw, applied to every month.
2. **[fix]** `get-reserve-fit.ts` resolves one `currentLimit` per category (the
   running month's, else the latest in range) and walks every past month against
   it. A category with no current limit at all keeps its own history — treating
   that as a limit of zero would turn all its spend into overage.

## Out of scope (user chose "current limit only")

- Worst-rotation trough. The number stays sensitive to where in the range the
  lump falls: move Food & Home's June/July to the front of the same window and
  needed goes from ~2 zł to ~949 zł.
- Reporting a deficit instead of a buffer when mean net flow is negative.
- Fill time per row.
