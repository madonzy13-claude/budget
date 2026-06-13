# 260613-jp6 — Spendings loading skeleton must mirror the grid

**Commit:** `63e2d14`
**File (only):** `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/loading.tsx`

## Problem

The spendings tab Suspense fallback rendered a GENERIC list skeleton (avatar
circle + 2 text lines + right block ×8) — looked like the wallets/list layout,
not the spendings column grid.

## Fix

Rewrote `loading.tsx` (pure server component, no `"use client"`, no hooks) to
mirror the real spendings layout:

- **MonthNavigator placeholder** — centred row `h-12`: chevron block, label pill
  (`h-5 w-28`), chevron block; `border-b border-[var(--hairline-dark)]`.
- **Grid container** — `mt-4 flex gap-[var(--spacing-xs)] overflow-x-hidden
px-3 sm:px-6` (matches the real grid container paddings/gap).
- **3 column-card skeletons** — each matches the real `CategoryColumn` classes:
  `w-max min-w-[140px] sm:min-w-[160px] flex flex-col flex-shrink-0 rounded-xl
bg-[var(--surface-card-dark)] overflow-clip`.
  - Header row: `min-h-[44px] px-2 py-2 border-b border-[var(--hairline-dark)]`
    with grip dot + name line (`h-3.5 w-2/3`).
  - Four label/value summary rows (planned / overspent / reserves used / left),
    each `flex flex-col px-2 py-1.5 border-b border-[var(--hairline-dark)]` with
    a label (`h-2.5 w-12`) over a value (`h-3.5 w-10`; reserves widened to
    `w-16` to mimic "53 / 324.90").
  - Expenses section: label (`h-2.5 w-14`) + quick-entry box
    (`h-9 w-full rounded-md`) + 4 expense-amount lines (`h-3.5 w-10`).

Uses the existing `Skeleton` primitive and DESIGN.md tokens
(`--surface-card-dark`, `--hairline-dark`); skeleton fills stay neutral.

## Verification

- `bunx tsc --noEmit` — EXIT 0 (clean).
- `bunx eslint` on the file — EXIT 0 (no unused / lint errors).
- No loading-specific tests exist (none to run).
- `docker compose build web` — EXIT 0; `make restart-web` — EXIT 0.
- `docker compose ps web` — **Up (healthy)**.
- Served bundle (`/app/apps/web/.next/server/app/.../spendings/page.js`, where
  the route's server-component loading.tsx is bundled):
  - `min-w-[140px] sm:min-w-[160px]` — PRESENT.
  - `h-9 w-full rounded-md` (quick-entry box) — PRESENT.
  - OLD marker `h-8 w-8 rounded-full shrink-0` — ABSENT (0 hits).

## Constraints honored

- Only `loading.tsx` edited.
- Code-only atomic commit; summary/PLAN/STATE not committed; no ROADMAP change.
