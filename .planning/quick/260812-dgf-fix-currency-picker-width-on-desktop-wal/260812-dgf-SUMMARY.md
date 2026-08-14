---
quick_id: 260812-dgf
status: complete
date: 2026-08-12
commit: 8c81fe5f
---

# Quick Task 260812-dgf — Summary

## What was wrong

Wallet rows on the Wallets tab rendered the currency picker at **96px** on
desktop instead of the intended **224px**, so the rich label
(`code + localized name + symbol`) collapsed — the name span measured **3px**.

## Root cause

Tailwind's source scanner does not extract a class candidate that is glued to a
template interpolation. Both wallet-row cells were written as:

```tsx
className={`... sm:w-[96px] md:w-[224px]${cond ? " ring-1 …" : ""}`}
```

so `md:w-[224px]` never reached the CSS bundle (verified: zero occurrences of
`224px` in `/_next/static/css/*.css`, while `w-\[96px\]` was present). The cell
fell back to the `sm` width.

## Fix

Whitespace before `${` at all three glue sites:

- `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx` (draft + persisted rows)
- `apps/web/src/components/budgeting/scheduled-payments-list.tsx` (`py-3` — latent, same bug class)

Guard: `apps/web/test/tailwind-class-scanner-guard.test.ts` scans every
`apps/web/src/**/*.tsx` and fails if a `className={\`` literal lacks whitespace
before `${`. Written first, went red on exactly the two offending files, green
after the fix.

## Verification (measured, not assumed)

|                         | before | after                      |
| ----------------------- | ------ | -------------------------- |
| cell width @1440px      | 96px   | **224px**                  |
| trigger width           | 96px   | 224px                      |
| name span ("US Dollar") | 3px    | 61px                       |
| `224px` in served CSS   | absent | `w-\[224px\]{width:224px}` |

- Playwright measurement against the live local stack (temporary spec, removed after).
- Row screenshot confirms `USD  US Dollar  $  ⌄` renders whole.
- `bunx vitest run` — 4 files, 55 tests passed (wallet-row, wallets-sectioned-list,
  scheduled-payment-form, new guard).
- `tsc --noEmit` clean; `eslint --max-warnings=0` clean.
- Web image rebuilt via `make build-web` (VAPID injected) and recreated; container healthy.

## Notes

Only the two wallet-row sites lost an arbitrary-value utility. The
scheduled-payments one (`py-3`) happened to be generated elsewhere in the tree,
so it was invisible — fixed anyway, since the next edit could have made it real.
