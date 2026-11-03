---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 04
subsystem: web
tags: [i18n, e2e, fx-seed]
key-files:
  created:
    - apps/web/test/i18n/multi-currency-keys.test.ts
    - apps/web/e2e/steps/fx-seed.steps.ts
  modified:
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/e2e/steps/budgets-aggregate.steps.ts
requirements-completed: []
---

# 14-04 Summary: Phase 14 i18n keys + shared FX seed step

- en/pl/uk: `settings.identity.currency_confirm_{title,body,cta,cancel}`, new `currency_hint`, `grid.categoryCurrency.{label,changeHint,rateError}`, `grid.limitEquivalent`; pl/uk `bdp.tasks.title.RESERVE_TOPUP_withdraw` reworded ("W rezerwie jest {amount} za dużo" / "У резерві зайвих {amount}"). `currency_locked_tooltip` / `currencyReadOnlyAria` kept (plan 19 prunes).
- `fx-seed.steps.ts`: `seedFxRows`, `seedFxRates` (aggregate pairs, today + yesterday), `deleteSeededFx`, `resolveFxDate` (`today` / `today-N` UTC), and step `Given the FX rate {string} to {string} on {string} is {string}` — worker role, provider 'e2e-seed', ON CONFLICT DO NOTHING RETURNING, cleanup registered once per scenario deleting only inserted rows (migrator).
- budgets-aggregate.steps.ts imports `seedFxRates`; its "the FX cache is warm" step unchanged in behaviour.

## Verification
- Vitest multi-currency-keys: RED 10 failed / 1 passed → GREEN 11/11; all test/i18n 140/140.
- bddgen exit 0; `--grep "all-budgets|aggregate"` chromium on budget-dev → 6 passed, `.last-run.json` status passed. 0 leftover `e2e-seed` rows afterwards.
- `make build-web` run after this plan (i18n change is user-visible in pl/uk task titles).

## Deviations
None.

## Self-Check: PASSED
