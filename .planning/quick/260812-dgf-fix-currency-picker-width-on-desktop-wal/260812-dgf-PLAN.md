---
quick_id: 260812-dgf
description: Fix currency picker width on desktop wallets rows
date: 2026-08-12
mode: quick
---

# Quick Task 260812-dgf: Currency picker renders too narrow on desktop

## Problem

On the Wallets tab (desktop), the currency cell of a wallet row renders **96px**
instead of the intended **224px**, squeezing the rich label (`code + name + symbol`)
so the localized name span collapses to ~3px.

## Root cause (verified live, not inferred)

`apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx` writes the cell
classes as a template literal whose LAST token is glued to the interpolation:

```tsx
className={`w-[44px] rounded ... sm:w-[96px] md:w-[224px]${
  currencyOpen ? " ring-1 ring-[var(--primary)]" : ""
}`}
```

Tailwind's source scanner never emits `md:w-[224px]` from that form. Evidence:

- Playwright measurement at 1440px viewport: `cellWidth: 96`, `triggerWidth: 96`,
  name span width `3px`, while the element's class attribute _does_ contain
  `md:w-[224px]`.
- The served CSS bundles (`/_next/static/css/*.css`) contain **zero** occurrences
  of `224px`, while `w-\[96px\]` (followed by whitespace in source) is present.

Same glue exists at three call sites; only the two wallet-row ones lose an
arbitrary-value utility, but all three are latent.

## Tasks

### Task 1 — un-glue the class from the interpolation

Files:

- `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx` (draft row ~257, persisted row ~739)
- `apps/web/src/components/budgeting/scheduled-payments-list.tsx` (~151)

Action: put a space before `${` so the final utility ends at a whitespace
boundary the scanner recognises.

Verify: `grep -R '224px' apps/web/.next` after build → non-zero; no
`className={\`...[^ ]${` matches remain.

Done: all three template literals separate the static class list from the
interpolated fragment with a space.

### Task 2 — rebuild web and re-measure

Action: `docker compose build web && make restart-web`, then re-run the temporary
Playwright measurement (`apps/web/e2e/.tmp-measure/`) at 1440px.

Verify: `cellWidth === 224`, currency name span no longer truncated to a sliver.

Done: measurement shows 224px; temp measurement dir deleted afterwards.

### Task 3 — regression guard

Add a Vitest component assertion (or e2e step) is NOT warranted for a CSS-scanner
bug; instead the guard is a repo-level grep test that fails if a className
template literal glues a class to `${`.

Done: `apps/web/test/components/wallet-row-currency-width.test.ts` asserts the
source files contain no `<non-space>${` inside a `className={\`` literal.

## must_haves

- truths: currency cell is 224px wide at >=768px; `md:w-[224px]` present in built CSS
- artifacts: wallet-row.tsx, scheduled-payments-list.tsx, guard test
- key_links: apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx
