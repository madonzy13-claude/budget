---
id: 260807-7f7
slug: fix-overview-range-pref-never-persisting
date: 2026-08-07
mode: quick
---

# Quick: the Overview range pick never reached the database

## Symptom

"Sometimes the selected time range gets reset after app reload." The pick is
meant to be stored per user per budget.

## Root cause (evidence, not theory)

`PUT /budgets/:id/ui-prefs` validates with

```ts
// apps/api/src/routes/budget-members.ts:33-38
const uiPrefsSchema = z.object({
  prefs: z.record(z.string().min(1).max(64), z.array(z.string().uuid()).max(200)),
});
```

Every value must be a list of **UUIDs**. The range encodes as
`["last3Months"]` or `["custom", "2026-01-01", "2026-03-31"]`
(`apps/web/src/lib/range-pref.ts`), so the write is rejected 400 and never
reaches `tenancy.budget_members.ui_prefs`.

Dev DB confirms it: **0 of 27** non-empty `ui_prefs` rows hold an
`overviewRange` key, while `planned-categories` (UUID lists, same endpoint,
same hook) persist fine.

Why "sometimes" and not "always": `use-member-ui-prefs.ts` writes the pick into
the React Query cache optimistically and swallows the failed PUT
(`.catch(() => undefined)`, deliberate — a filter is not worth a popup). That
optimistic value is persisted to IndexedDB, so a reload that restores it before
the background refetch still opens on the right range; once the refetch replaces
the cache with the server's `{}`, the next reload falls back to the default.

The user-level twin (`apps/api/src/routes/settings.ts`) already uses the loose
`z.array(z.string())` — the member route is the outlier.

## Tasks

1. **[test]** Add failing cases to `apps/api/test/routes/budget-member-ui-prefs.test.ts`:
   `PUT {prefs:{overviewRange:["last3Months"]}}` → 200 + merged, and the custom
   form `["custom","2026-01-01","2026-03-31"]` → 200 + merged. Run red.
2. **[fix]** Relax the value schema to `z.array(z.string().min(1).max(64)).max(200)`,
   keeping the key bound and both length caps (still a trust boundary: bounded
   key, bounded element, bounded list). Update the comment: values are opaque
   short tokens — category ids OR range tokens/ISO dates. Run green.
3. **[verify]** Rebuild + restart `api`; drive the live Overview at
   https://budget-dev.madonzy.com, confirm `overviewRange` lands in
   `tenancy.budget_members.ui_prefs` and survives a reload.

## Out of scope

- The frontend swallow-on-failure behaviour (deliberate, documented).
- The pre-existing "degraded at mount seeds the default before the stored pick
  restores" race in `overview-sections.tsx` — noted, not fixed here.

## Do not

- Push. Local commits only.
