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

## Follow-up 2 (owner): the reserve cap in the month's currency too
A past month's whole column now reads in its own currency, the reserve cap ("available") included. The cap is used (in the month's currency) plus the balance left at the month's end, converted at the month's rate (D-08 date). `own.reserveCurrency` and the header's second-currency formatting are removed.
- TDD: `past-month-reserve-currency` was red (cap 5000, the 50 € unconverted) and is green at 21115 (211.15 zł). The header change is a deletion: same output once the server stopped sending a second currency (refactor, green → green).
- Regression: Vitest 3077/0; backend 2381 + 2 baseline; currency E2E 16 passed, 1 flaky (closed-month adjust, passed on retry).

## Follow-up 3 (owner)
- **A past month with no limit can change currency** ("my category", September). Before, the change did nothing, and the EUR limit saved next was refused (`currency_mismatch`), which the slider showed as "check your connection". The month now gets its own zero segment in the new currency; switching it to the category's own currency is a no-op. Live: PATCH 200 then POST 201; Sep EUR €150, Oct USD $300 untouched.
- **Typed amounts stay as typed:** an amount typed in the open form is kept when the currency changes after it. Untouched amounts still convert.
- **No "Limit converts at today's rate…" hint** (key removed in en/pl/uk).
- **Errors say why:** a refused save toasts "Couldn't save the category: {reason}. Please try again later, or report it if it keeps happening." Reasons are mapped from the server code (currency_mismatch / not_found / validation / unknown with the HTTP status). Offline keeps its own toast.
- **TDD, each test seen red first:** the repo no-segment test (+ the same-currency no-op), the 3 slider tests (typed kept, no hint, reason toast), and the i18n wording.
- Regression: Vitest 3080/0; backend 2382 + 2 baseline; currency E2E 14 passed + 1 flaky (golden timeline). The @category-currency scenario still asserted the removed hint and was updated (now asserts no hint + the converted limit shown): 4/4 pass.
