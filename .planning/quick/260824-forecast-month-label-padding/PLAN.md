---
id: 260824-f2o
slug: forecast-month-label-padding
date: 2026-08-24
mode: quick
---

# Forecast strip: drop a month name earlier so the printed one keeps its padding

## Problem

On the Overview "Money forecast for the next 100 days" strip, the opening month
label is printed flush against the next month's dashed divider.

Live case (user screenshot, 260824, iPhone @3x): the window opens 24 Aug, Sep
turns on day 8 of 100 → `8/99 = 8.08%`. The guard added on 260823 is
`MIN_LABEL_PCT = 8`, so the segment clears it by 0.08 and "Aug" is printed.

The threshold was calibrated against glyph width alone — "8% of a ~330px phone
strip is ~26px, about the width of 'Aug' at 10px". It ignored the label's own
`marginLeft: 8px` lead-in and left no trailing gap. Real cost on a 336px strip:
8px lead + ~20px glyphs = 28px in 27px of room → the name touches the divider.

## Change

`apps/web/src/components/budgeting/overview/projection-timeline.tsx`

- `MIN_LABEL_PCT` 8 → 12, and rewrite the comment to state the full budget the
  number stands for: lead-in + widest short month name (uk/pl run 4 chars) +
  trailing gap ≈ 40px on a 336px phone strip.

One constant. It already governs BOTH ends — the head segment's room is the gap
to the next open, the tail segment's is `100 - pct` — so the last month gets the
same clearance from the strip's rounded end with no second rule.

## TDD

`apps/web/test/projection-timeline.test.tsx` — add a failing case first:

- window opening `2026-08-24`, 100 days → labels are `["Sep","Oct","Nov"]`,
  "Aug" dropped. Fails at 8 (8.08% ≥ 8), passes at 12.

Existing cases that must stay green (they bracket the new threshold):
- `2026-08-01` + 100 days → Sep at 31.3%, "Aug" kept.
- `2026-07-01` + 33 days → Aug at 96.9%, tail dropped.
- `2026-08-29` + 100 days → 4 dividers, 3 names.

## Verify

1. `cd apps/web && bunx vitest run test/projection-timeline.test.tsx`
2. `bun run lint` (eslint --max-warnings=0 — husky is non-blocking)
3. `docker compose build web && make restart-web` — FE edits do not hot-reload
4. Playwright against `https://budget-dev.madonzy.com` at phone width: the strip
   shows no "Aug", the Sep divider stands alone at ~8%, and Sep/Oct/Nov keep
   their gap.
