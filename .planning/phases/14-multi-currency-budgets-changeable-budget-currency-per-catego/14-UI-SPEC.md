---
phase: 14
slug: multi-currency-budgets
status: draft
shadcn_initialized: false
preset: none
created: 2026-11-03
---

# Phase 14 — UI Design Contract

> Existing app, existing visual language (DESIGN.md: Binance dark, single yellow accent). This phase adds NO new styling, tokens, or components beyond one confirm dialog (existing Dialog primitive). Every item below reuses a live component.

---

## Design System

| Property          | Value                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Tool              | none (no `components.json`; hand-rolled shadcn/Radix primitives already in `apps/web/src/components/ui`) |
| Preset            | not applicable (Registry safety gate: not applicable)                                                    |
| Component library | Radix (desktop) / native `<select>` (touch), via `CurrencyPicker`                                        |
| Icon library      | existing (lucide) — no new icons                                                                         |
| Font              | BinanceNova / BinancePlex per DESIGN.md (unchanged)                                                      |

Source: DESIGN.md, additional_context; nothing re-asked.

---

## Spacing Scale

Unchanged 4-multiple scale (4/8/16/24/32/48/64). Exceptions: none new. Touch targets for the new picker instances = the existing `CurrencyPicker` size (do not resize). Wallet reserve row must match the other wallet sections exactly — same row height, same 16px gap between amount and currency field (commit a4e4866b).

## Typography

No new roles. Reuse the host component's own: category-slider field label/value, settings row label (title-sm 16/600) + hint (14/400 muted), wallet-row amount. Weights stay 400 + 600.

## Color

| Role            | Value                       | Usage                                                                                                                      |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Dominant (60%)  | `--canvas-dark` token       | unchanged                                                                                                                  |
| Secondary (30%) | `--surface-card-dark` token | unchanged; confirm dialog uses existing Dialog surface                                                                     |
| Accent (10%)    | `--primary` token           | ONLY: confirm-dialog primary button "Change currency" (existing primary Button)                                            |
| Destructive     | `--destructive` token       | ONLY the rate-unavailable inline error text (category slider). No destructive actions in this phase (change is reversible) |

Accent reserved for: the single primary button of the budget-currency confirm dialog. Category currency, FX suffix, "≈" text use muted / body tokens only, never accent.

Focal points: (1) budget-currency confirm dialog — the primary "Change currency" button is the focal anchor; (2) category slider — the limit field with its live "≈" preview is the focal anchor; the currency picker and helper line stay secondary.

---

## Component Contract

### 1. Category currency — `budgeting/category-slider.tsx` (add + edit)

- Add a "Currency" field using `common/currency-picker.tsx` wrapped in `.editable-dots` (global.css), placed directly under the limit field, same label style as sibling fields.
- Add mode: default = budget currency at that moment (D-04). Edit mode: default = category's stored currency, editable even when transactions exist (D-07).
- Limit input suffix/prefix shows the category currency (not the budget's).
- On edit when the currency changes: helper line under the field (muted 14/400): "Limit converts at today's rate: {old} → {new}. Past transactions keep their currency." Show the converted limit preview ("≈ 233 EUR") live in the limit field; user may overwrite before saving. No blocking dialog.
- States: default, open (picker), saved (existing slider save flow), rate-unavailable (below).
- Rate unavailable: inline error coloured through the `--destructive` token (Tailwind `text-destructive`; it resolves to `--trading-down`), same as other inline form errors — never a literal hex or an arbitrary `text-[#…]` class (a hard-coded hex broke the light theme before) "No exchange rate for {pair} yet. Try again later." Save disabled only on currency change.

### 2. Spendings grid + category rows — limit in own currency

- A category whose currency ≠ budget currency shows its limit in its own currency with currency suffix via `FxAmount` (`spendings-grid/foreign-amount.tsx`), plus a muted second line/tooltip "≈ {amount in budget currency}". Spent/remaining and all totals are in budget currency (D-02, D-08).
- Category whose currency = budget currency: unchanged, no suffix.
- Past month: the "≈" uses the month's frozen rate; no extra marker.

### 3. Transactions in a non-budget currency

- Render with `FxAmount` exactly as today's foreign-currency transactions (D-03). After a budget currency change, old-currency transactions show their suffix automatically; no migration notice, no new badge.
- `transaction-slider.tsx` / `apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx`: currency defaults to the selected category's currency (D-05); changing category re-defaults the currency only if the user has not manually changed it. User can still override via existing picker.

### 4. Budget currency — `settings/budget-identity-section.tsx`

- Owner: picker always enabled (`.editable-dots`), lock icon/tooltip and `currency_locked` branch removed. Members: read-only display as today.
- Selecting a different currency opens a confirm Dialog (a change re-expresses every total). Cancel ("Keep {currentCurrency}") = revert picker to current value, no request. Confirm = PATCH, then toast `identity.currency_saved` (existing).
- Dialog title: "Change budget currency to {currency}?" — `{currency}` is the ISO code of the newly selected currency (e.g. EUR). Cancel label `{currentCurrency}` is the ISO code of the current budget currency.
- Dialog states: idle, submitting (button disabled + existing spinner), error (existing toast.error "Failed to update currency").
- Update `identity.currency_hint` (below).
- i18n: DELETE `identity.currency_locked_tooltip` from `apps/web/messages/{en,pl,uk}.json` (read today by `budget-identity-section.tsx`; the reader is removed with the lock branch).

### 5. Reserve wallets — `wallets-tab/wallet-row.tsx`

- Remove the `isReserveSection` read-only branch: currency uses the same editable `CurrencyPicker` + `.editable-dots` as the other wallet sections, no extra badge or explanation (D-09).

### 6. Reserve message (Reserves tab) + RESERVE_TOPUP task

- Existing templates keep their shape; `{amount}` becomes a locale-formatted list built with `Intl.ListFormat(locale, {type:"conjunction"})` over per-currency parts (gives "and" / "i" / "і" free, no new copy key for the conjunction). Order: wallet currencies first, then the others, each alphabetical.
- Part format: `120 PLN` (money formatted by existing formatter, currency code suffix). A currency with no reserve wallet of its own: `15 EUR (≈ 64 PLN)` — equivalent in the BUDGET currency (D-16). If the budget currency is that same currency, no "≈". This string is produced in code (Intl money formatting + `Intl.ListFormat`), NOT by a new i18n key; the only i18n strings involved are the existing task-title templates with `{amount}`.
- Net result (D-15): when nets cancel to one currency, show a single amount.
- Tolerance (D-13) [ASSUMED — needs user sign-off]: no threshold exists today (`recompute-reserve-topup-task.ts` does an exact `surplus === 0n`). One rule: dead-band of max(1 whole unit of the budget currency, 0.5% of total need), applied only to the cross-currency (converted) remainder; same-currency lines stay exact (no tolerance).
- Single-currency reserves render exactly as today (list of one).
- No new colors: surplus/shortfall keep today's treatment.

---

## Copywriting Contract

Never say "draft"; use "unconfirmed payment". Currency display uses ISO codes in lists ("PLN"), per existing formatter elsewhere.

| Element                                                | en                                                                                                                                | pl                                                                                                                                     | uk                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Primary CTA (confirm dialog)                           | Change currency                                                                                                                   | Zmień walutę                                                                                                                           | Змінити валюту                                                                                                                      |
| Dialog title                                           | Change budget currency to {currency}?                                                                                             | Zmienić walutę budżetu na {currency}?                                                                                                  | Змінити валюту бюджету на {currency}?                                                                                               |
| Dialog body                                            | Every total will be shown in {currency}, converted at the rate of each date. Transactions keep the currency they were entered in. | Wszystkie sumy będą pokazane w {currency}, przeliczone po kursie z danego dnia. Transakcje zachowują walutę, w której zostały wpisane. | Усі суми буде показано в {currency}, перераховані за курсом відповідного дня. Транзакції зберігають валюту, у якій їх було введено. |
| Dialog cancel                                          | Keep {currentCurrency}                                                                                                            | Zostaw {currentCurrency}                                                                                                               | Залишити {currentCurrency}                                                                                                          |
| `identity.currency_hint` (replaces "Used to convert…") | Totals are shown in this currency. Transactions keep their own.                                                                   | Sumy są pokazywane w tej walucie. Transakcje zachowują własną.                                                                         | Підсумки показуються в цій валюті. Транзакції зберігають власну.                                                                    |
| Category currency label                                | Currency                                                                                                                          | Waluta                                                                                                                                 | Валюта                                                                                                                              |
| Category currency change hint                          | Limit converts at today's rate: {old} → {new}. Past transactions keep their currency.                                             | Limit przeliczy się po dzisiejszym kursie: {old} → {new}. Dotychczasowe transakcje zachowują walutę.                                   | Ліміт перерахується за сьогоднішнім курсом: {old} → {new}. Попередні транзакції зберігають валюту.                                  |
| Category rate error                                    | No exchange rate for {pair} yet. Try again later.                                                                                 | Brak kursu dla {pair}. Spróbuj później.                                                                                                | Немає курсу для {pair}. Спробуйте пізніше.                                                                                          |
| Limit equivalent (grid/tooltip)                        | ≈ {amount}                                                                                                                        | ≈ {amount}                                                                                                                             | ≈ {amount}                                                                                                                          |
| `tasks.title.RESERVE_TOPUP`                            | Top up reserve by {amount}                                                                                                        | Uzupełnij rezerwę o {amount}                                                                                                           | Поповніть резерв на {amount}                                                                                                        |
| `tasks.title.RESERVE_TOPUP_withdraw`                   | Reserve has {amount} extra                                                                                                        | W rezerwie jest {amount} za dużo (replaces "Rezerwa ma {amount} nadwyżki")                                                             | У резерві зайвих {amount} (replaces "Резерв має {amount} надлишку")                                                                 |
| Example {amount} (en)                                  | 120 PLN and 15 EUR (≈ 64 PLN)                                                                                                     | 120 PLN i 15 EUR (≈ 64 PLN)                                                                                                            | 120 PLN і 15 EUR (≈ 64 PLN)                                                                                                         |
| Reserve tab shortfall/surplus messages                 | existing keys; `{amount}` = same per-currency list                                                                                | same                                                                                                                                   | same                                                                                                                                |
| Empty state                                            | n/a — no new empty state                                                                                                          |                                                                                                                                        |                                                                                                                                     |
| Error state                                            | existing toast "Failed to update currency" + retry by re-selecting                                                                |                                                                                                                                        |                                                                                                                                     |
| Destructive actions                                    | none (currency changes are reversible)                                                                                            |                                                                                                                                        |                                                                                                                                     |

Implementation note: existing task title strings are kept as-is EXCEPT `tasks.title.RESERVE_TOPUP_withdraw` in pl and uk, which are deliberate replacements (per-currency list, plural/gender-neutral): pl "Rezerwa ma {amount} nadwyżki" → "W rezerwie jest {amount} za dużo"; uk "Резерв має {amount} надлишку" → "У резерві зайвих {amount}". en "Reserve has {amount} extra" is unchanged. All other task strings stay as-is. The "15 EUR (≈ 64 PLN)" amount format is produced in code (Intl formatting), not by a new i18n key.

---

## Registry Safety

| Registry        | Blocks Used                                                     | Safety Gate                                                                         |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| shadcn official | none (existing in-repo primitives only: Dialog, CurrencyPicker) | not required                                                                        |
| third-party     | none                                                            | not applicable — no third-party registries declared, no vetting needed (2026-11-03) |

---

## Pre-populated From

CONTEXT.md D-01..D-17 (locked), DESIGN.md, additional_context. No user questions asked.

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
