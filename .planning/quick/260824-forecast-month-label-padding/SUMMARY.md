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

---

# Round 2 — measure the strip, scale the threshold (user's ask)

The flat 12% was the right cost of a name on a phone and ~4× the glyphs' needs
on a desktop, so a desktop dropped names it had room for. Replaced with a pixel
budget converted per render:

- `MIN_LABEL_PX = 40` (8px lead-in + widest short month + trailing gap) and
  `FALLBACK_STRIP_PX = 326` (narrowest strip that ships).
- Exported pure `minLabelPct(stripPx)` — unit-testable without a layout engine.
- Strip width measured by a **callback ref + ResizeObserver**, not an effect:
  callback refs run in the commit phase, so the first frame is already measured
  and no label pops in after paint. React 19 disconnects via the returned
  cleanup. Guarded for environments with no `ResizeObserver`.
- Unmeasured (SSR, first commit, hidden tab) reads 0 → assume a phone, the case
  where names collide, rather than dividing by zero.

## Evidence

- 4 new `minLabelPct` tests, red before the helper existed, green after. The 29
  existing component tests pass **unchanged** — happy-dom reports `clientWidth:
  0`, so they now exercise the fallback, which is the old 12% by construction.
- Full web suite: 2318 passed, 34 skipped, 0 failed.
- E2E, both projects, instrumented against the live stack on 24 Aug (Sep turns
  on day 8 = 8.08%):
  - **1280px** — strip 1198px → threshold 3.3% → labels `[Aug, Sep, Oct, Nov]`.
    Aug is now KEPT and clears its divider.
  - **390px** — strip 324px → threshold 12.3% → labels `[Sep, Oct, Nov]`.
    Aug still dropped, as it must be.
  - Same invariant assertion passes on both. 6/6 green.
- `eslint --max-warnings=0`, `tsc --noEmit` clean.

The 260824 trade-off note above is now void: no width pays for another's limit.
