---
id: 260807-7f7
slug: fix-overview-range-pref-never-persisting
date: 2026-08-07
status: complete
---

# Summary

The Overview range pick was rejected by its own endpoint. `PUT
/budgets/:id/ui-prefs` required every preference value to be a list of UUIDs;
the range encodes as `["last3Months"]` or `["custom","2026-01-01","2026-03-31"]`,
so every range write 400'd and the pick only ever lived in the client cache —
which is why it survived some reloads and not others.

## Changed

- `apps/api/src/routes/budget-members.ts` — `uiPrefsSchema` values are now
  bounded opaque tokens (`z.array(z.string().min(1).max(64)).max(200)`) instead
  of UUIDs. Key bound and both length caps kept: the row stays un-growable.
- `apps/api/test/routes/budget-member-ui-prefs.test.ts` — two new cases (preset
  and custom range) that were red before the change; the "not a list at all →
  400" case still holds the trust boundary.

## Verified

- `bun test apps/api/test/routes/budget-member-ui-prefs.test.ts` — 2 fail before,
  8 pass / 0 fail after.
- `bun test apps/api/test/routes/budget-members.test.ts settings.test.ts` — 37 pass.
- `bunx tsc --noEmit -p apps/api/tsconfig.json` — clean.
- Live, against https://budget-dev.madonzy.com with a rebuilt api: a throwaway
  Playwright run signed up a fresh user, picked 6M on the Overview, read the
  preference back from the server (`{"overviewRange":["last6Months"]}`) and
  found it still selected after a reload. Postgres went from **0** rows holding
  an `overviewRange` key to 1. The temp spec was removed afterwards.

## Not done (deliberate)

- No permanent E2E scenario: the Overview has no `.feature` at all yet, and the
  first one is more work than this fix. The route tests are the regression guard.
- `overview-sections.tsx` seeds the DEFAULT range if `degraded` (offline /
  server-down) is true before the IndexedDB restore lands, and never re-seeds
  once the stored pick arrives. A second, smaller reset path — untouched here.
