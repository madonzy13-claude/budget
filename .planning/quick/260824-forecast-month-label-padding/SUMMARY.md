---
id: 260824-f2o
slug: forecast-month-label-padding
date: 2026-08-24
mode: quick
status: complete
---

# Summary

`MIN_LABEL_PCT` 8 → 12 in `projection-timeline.tsx`. The 260823 guard sized the
threshold from glyph width alone and forgot the label's own 8px lead-in plus any
trailing gap, so a segment could clear the check and still land on the divider.
12% of the narrowest strip that ships (~326px at a 390px viewport) is ~39px:
8 lead + ~24 for the widest short month a locale prints + a real gap.

One constant governs both ends — head room is the distance to the next open,
tail room is `100 - pct` — so the last month got the same clearance with no
second rule.

## Evidence

- **Unit, red→green.** New case `2026-08-24` + 100 days (Sep turns on day 8 =
  8.08%, the live case in the user's screenshot) expected `["Sep","Oct","Nov"]`,
  got `["Aug","Sep","Oct","Nov"]`. Green after the bump. 29/29 in the file.
- Three sibling tests used a 40-day fixture tuned to the old threshold; the
  product window is always 100 days, so they were retuned to `2026-07-15` + 100
  (all four months wide) rather than the threshold being weakened to suit them.
- **Full web suite:** 2314 passed, 34 skipped, 0 failed.
- **E2E, and this is the part that mattered.** Added `@overview @projection`
  scenario "Month names never touch the divider that follows them" with a
  pixel-level page-object assertion — happy-dom lays out nothing, so a
  percentage guess that is 2px short reads green in every unit test.
  - Written first, run against a web image rebuilt with the constant back at 8:
    **it passed.** Two defects in the assertion: `.sort()` on numbers is
    lexicographic, and the search for "the next divider" started from the
    label's RIGHT edge, so an already-overlapping label skipped its own rule and
    measured a comfortable gap to the next one.
  - Fixed (search from `box.x`, numeric sort), re-run against the same broken
    image: **failed at −2.82px** — the label physically overlapping the divider,
    which is the user's screenshot measured.
  - Restored to 12, rebuilt, **6/6 green** on chromium (1280) and mobile (390).
- Screenshot at 390px: no "Aug", its divider still drawn at ~8%, Sep/Oct/Nov
  each padded.
- `eslint --max-warnings=0` and `tsc --noEmit` clean.

## Note

12% is deliberately sized for the phone, so a desktop card wide enough to fit a
short month in an 8% segment now drops that name too. The divider still marks
the turn. Erring the other way costs every phone a collision.
