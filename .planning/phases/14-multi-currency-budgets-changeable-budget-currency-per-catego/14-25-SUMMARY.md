---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 25
subsystem: budgeting/api/web
tags: [gap-closure, owner-feedback]
requirements-completed: [D-07, D-17]
---

# 14-25 Summary: a month keeps the currency it had

The owner decided (2026-11-04):
- a past month keeps its own currency and figures, exactly;
- reserves are calculated in the latest month's currency;
- a change made while viewing a past month affects only that month.

- **Month currency** = the currency of the limit segment in force that month, else the category's current currency.
- **Summary:** a past month's `limitOriginal`, `limitCurrency` and `own` (limit, spent, balance) are in the month currency, with no conversion. This replaces the 14-24 CR-01 conversion into the current currency.
  - `own.reserveCurrency` is the category's latest currency. The header formats reserve available and overspent in it.
  - Own spend for the month converts into the month currency.
- **Currency change with `month`:** if `month` is before the current month, only that month changes.
  - The segment covering it is split out and converted at the month's D-08 rate, from `converted_from`, so switching back restores the typed amount exactly.
  - The category's current currency is untouched, and the response carries `month`.
  - From the current month, it changes the current month and later ones, as before.
- **Limit route:** a past single-month edit is checked against that month's currency.
- **Transactions** with no currency take their date's month currency.
- **Web:** the editor opens in the viewed month's currency, and the slider sends `month` for a past month. A currency-only save skips the rounded preview POST in a past month too. Quick entry uses the month currency.
- **Live check** (fresh USD budget): a PLN category limited at 400 zł from Aug; switching Oct to EUR gave Sep PLN 400, Oct EUR 90.92, Nov PLN 400. The category stayed PLN, and the grid read "€90.92" for Oct and "400 zł" for Nov.
- Overview per-category charts keep reading a category in its CURRENT currency. Their averages span months, so they need one currency.

## Verification
- Web Vitest 3077 pass / 0 fail; backend gate 2376 pass + the same 2 pre-phase baseline fails; E2E (phase tags + @overview + @phase8 + @reserves-golden, chromium + mobile) 111 passed, 2 flaky (projection slider, closed-month adjust — both passed on retry).

## Follow-up (owner): reserve used + overspent in the month's currency
A past month in another currency now reads its reserve used and overspent in THAT month's currency. Only "available" (the reserve balance) stays in the category's latest currency.
- New pure helper `reserveCoverInMonthCurrency`. The month's overspend is exact in its own currency, and the engine's covered share carries over: full and none are exact, a partial share rounds half-up, and used + overspent = the overspend.
- The header signs "used" whenever its currency differs from "available".
- TDD: each test was seen red without its change, then green with it:
  - the helper unit test;
  - the DB test `past-month-reserve-currency` (1163 → 5000);
  - the header test.
- Live: Oct switched to EUR shows overspent €11.36 = spent €102.28 − limit €90.92.
- Regression: Vitest 3077/0; backend 2380 + 2 baseline; currency E2E 16 passed, 1 flaky.
