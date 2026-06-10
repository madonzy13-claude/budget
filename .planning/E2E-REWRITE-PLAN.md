# E2E feature rewrite plan

Aligns the 17 lingering Playwright BDD `.feature` files in `tests/e2e/features/` with the
v1.1 app surface (unified `/budgets/[id]/...` routes, `wallet` replacing `account`,
in-place txn edits, SPENDING/INCOME-only kinds, no `/workspaces` route, root `/${locale}`
as the authenticated landing). Per-file decisions and drafted replacement Gherkin below.

> Style anchor: `tests/e2e/features/auth/auth-guards.feature` and the passing reserves/
> wallets/spendings features. All routes use `/[locale]/budgets/[id]/...`. All scenarios
> reuse the `Given I am signed in as a fresh user with workspace "<name>"` fixture
> from `tests/e2e/steps/budget.steps.ts` (creates a v1.1 PRIVATE budget via
> `POST /api/budgets`; the verb "workspace" is preserved per brief).

## Summary

- Files processed: **17**
- DELETE: **5**
- REWRITE: **12**
- KEEP-AS-IS: **0**
- CRITICAL GAPS: **4**

---

## Per-file decisions

### 1. `tests/e2e/features/budget/bulk-recategorize.feature`

- **Decision:** REWRITE
- **Original purpose:** Multi-select transactions and re-categorize them; assert that
  each one renders an "edited" badge (correction-row pattern).
- **v1.1 contract:**
  - UI: Spendings grid at `/[locale]/budgets/[id]/spendings` is the only ledger surface
    (`apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx`).
  - API: `POST /transactions/bulk-recategorize` with body
    `{ transactionIds: uuid[], newCategoryId: uuid }`
    (`apps/api/src/routes/transactions.ts:328-364`).
  - Inline edit replaces correction-row badge (TXN-08 / D-PH2-07) — the "edited" badge
    no longer exists. Outcome to assert is **moved** transactions, not a badge.
- **Rationale:** Targets a removed surface (`/transactions` Page) and a removed concept
  ("edited" correction-row badge). The bulk-recategorize _operation_ is still a v1.1
  product capability (EXPN-10 still on backend), so we keep coverage but retarget UI to
  the Spendings grid and assert column-membership instead of badge.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Bulk re-categorize transactions across columns (EXPN-10)
    As a household member I can move several transactions from one category column to
    another in a single atomic operation. The originating column loses them and the
    destination column gains them; no correction-row badge is rendered in v1.1
    (in-place edit per TXN-08 / D-PH2-07).

    Background:
      Given I am signed in as a fresh user with workspace "Bulk Test"
      And the budget "Bulk Test" has a category "Food" with planned "0.00" "EUR"
      And the budget "Bulk Test" has a category "Eating Out" with planned "0.00" "EUR"
      And the budget "Bulk Test" has a transaction "10.00" "EUR" in category "Food"
      And the budget "Bulk Test" has a transaction "20.00" "EUR" in category "Food"

    Scenario: User bulk re-categorizes 2 transactions to a new category
      When I open the Spendings tab on a budget "Bulk Test"
      And I bulk re-categorize all "Food" transactions to "Eating Out"
      Then I see a transaction row "10.00" in the "Eating Out" column
      And I see a transaction row "20.00" in the "Eating Out" column
      And I do not see a transaction row "10.00" in the "Food" column
      And I do not see a transaction row "20.00" in the "Food" column
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/spendings.steps.ts` — add `When I bulk re-categorize all
"<from>" transactions to "<to>"` step that drives the existing multi-select +
    re-categorize popover on the Spendings grid; falls back to direct
    `POST /api/transactions/bulk-recategorize` if the UI affordance isn't yet wired.
  - `Then I do not see a transaction row "<amount>" in the "<column>" column` — add
    negative variant of the existing assertion in `spendings.steps.ts`.

---

### 2. `tests/e2e/features/budget/category-limits.feature`

- **Decision:** REWRITE
- **Original purpose:** Open a "Budget page" limit editor, save normal+cushion limit in
  EUR effective `2026-01-01`, assert the category persists with a "saved limit" hint.
- **v1.1 contract:**
  - UI: limits are edited per-category from the Spendings grid column header (planned
    cell). The standalone `/budget` page no longer exists. Plan 04 made the column
    header the limit-editor entry point (`packages/budgeting/...` SCD-2 still backs it).
  - API: `POST /api/categories/:id/limits`
    (`apps/api/src/routes/category-limits.ts:18-72`). Currencies inherit from the
    budget's `default_currency` when the body omits them (lines 41-59); the request
    body the UI sends therefore needs neither `normalCurrency` nor `cushionCurrency`.
- **Rationale:** "Budget page" no longer exists; "Categories list" no longer renders the
  per-category limit hint as a separate widget — the planned cell _is_ the hint.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Category effective-dated budget limits (BDGT-03..05)

    Scenario: User sets a planned limit on a category from the Spendings grid header
      Given I am signed in as a fresh user with workspace "Family"
      When I open the Spendings tab on a budget "Family"
      And I create a category "Housing"
      And I set the planned limit for column "Housing" to "1000.00"
      Then the column "Housing" header shows planned "1,000"

    Scenario: A persisted planned limit survives a page reload
      Given I am signed in as a fresh user with workspace "Family"
      When I open the Spendings tab on a budget "Family"
      And I create a category "Groceries"
      And I set the planned limit for column "Groceries" to "500.00"
      And I reload the page
      Then the column "Groceries" header shows planned "500"
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/spendings.steps.ts` — add `When I set the planned limit for column
"<name>" to "<amount>"` that double-clicks the planned-value cell (Plan 04
    inline-edit pattern), enters the amount, and presses Enter.
  - `Then the column "<name>" header shows planned "<amount>"` — assertion against
    `[data-testid="column-header-planned"]` (see `spendings-grid/column-header.test.tsx`).

---

### 3. `tests/e2e/features/budget/create-transaction.feature`

- **Decision:** REWRITE
- **Original purpose:** Manual transaction-form flow ("click Add transaction", fill
  kind/amount/currency/date, save, see it in `/transactions` list).
- **v1.1 contract:**
  - There is no `/transactions` page and no kind picker — `kind` is derived from the
    sign of `amount_original_cents` (negative → INCOME, positive → SPENDING) per the
    `createSchema` in `apps/api/src/routes/transactions.ts:47-54`. `TRANSFER` was
    removed (MIG-03).
  - The only user entry path is the Spendings grid quick-entry input
    (`apps/web/src/components/budgeting/spendings-grid/...` + the
    `tests/e2e/features/spendings/quick-entry.feature` flow).
- **Rationale:** Both routes and the form-shape are gone. We keep coverage of the
  "create a transaction from a category column" golden path but route it through the
  v1.1 quick-entry surface.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Capture a transaction from the Spendings grid

    Scenario: User captures an EUR expense via quick-entry on the Spendings grid
      Given I am signed in as a fresh user with workspace "Family"
      And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
      When I open the Spendings tab on a budget "Family"
      And I type "50.00" into the quick-entry input for category "Groceries"
      And I press Enter in the quick-entry input
      Then I see a transaction row "50.00" in the "Groceries" column
      And I see the column "Groceries" header balance shows "150.00"
  ```

- **Step-def changes required:** None — all steps already exist
  (`tests/e2e/features/spendings/quick-entry.feature` uses them).

---

### 4. `tests/e2e/features/budget/fx-stale-badge.feature`

- **Decision:** REWRITE
- **Original purpose:** A weekend USD expense in an EUR budget renders an "FX freshness"
  badge on its row (`isStale` from FX provider — D-03-a/b).
- **v1.1 contract:**
  - Ledger surface is the Spendings grid; the stale-rate badge is a per-row decoration
    on the transaction row (`apps/web/src/components/budgeting/spendings-grid/...`).
  - Backing API contract still returns `isStale` from `GET /fx/rate`
    (`apps/api/src/routes/fx.ts:36-41`).
- **Rationale:** Same business invariant, only the surface name changes
  (`/transactions` → Spendings grid).
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: FX freshness badge surfaces stale-rate transactions
    Per WARNING 6 (Plan 02-06 / D-03-a/b): a row sourced from a weekend FX rate carries
    a visible "rate from Friday" indicator so the user can spot non-fresh conversions.

    Scenario: Weekend USD expense in an EUR budget shows the FX freshness badge
      Given I am signed in as a fresh user with workspace "FX Stale"
      And the budget "FX Stale" has a category "Travel" with planned "0.00" "EUR"
      And the budget "FX Stale" has a transaction "100.00" "USD" in category "Travel" on "2026-05-09"
      When I open the Spendings tab on a budget "FX Stale"
      Then I see a transaction row "100.00" in the "Travel" column
      And the transaction row "100.00" shows an FX freshness badge
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/spendings.steps.ts` — extend the existing seed step `And the
budget "<name>" has a transaction "<amount>" "<ccy>" in category "<name>"` to
    accept an optional `on "YYYY-MM-DD"` suffix.
  - `Then the transaction row "<amount>" shows an FX freshness badge` — locator on the
    row's `[data-testid="fx-stale-badge"]` (already in code per Plan 02-06).

---

### 5. `tests/e2e/features/budget/search-filter.feature`

- **Decision:** DELETE
- **Original purpose:** Free-text search across the `/transactions` ledger backed by
  Postgres FTS on `note_tsv` (GIN index).
- **v1.1 contract:** No `/transactions` page, no search input on the Spendings grid in
  the current surface (`apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx`
  and its client island do not render a search field). The grid filters by month, not
  free text.
- **Rationale:** The product surface this scenario asserts no longer exists. The
  underlying FTS index does still live in the DB but is unreferenced by any v1.1 UI
  path; gating CI on a feature that has no entry point will block green.
- **Coverage not lost because:** No analogous v1.1 user flow exists. Listed in
  **Critical business gaps §1** so we re-add an integration test once a search
  surface ships.

---

### 6. `tests/e2e/features/budget/share-overrides.feature`

- **Decision:** REWRITE
- **Original purpose:** Per-category contribution shares sum-100 invariant (UI counter
  reads "Currently N% — must equal 100%", save button disabled below 100).
- **v1.1 contract:**
  - API contract still live: `PUT /api/categories/:id/share-overrides`
    (`apps/api/src/routes/share-overrides.ts:18-53`). Sum-100 is enforced both in
    application service and at DB level (DEFERRABLE constraint trigger), so the API
    layer is the _durable_ invariant boundary.
  - UI for share-overrides is a Phase 6 deliverable per `apps/api/src/routes/budgets.ts`
    comments around the shares routes; in the current v1.1 surface there is no editor
    page to drive.
- **Rationale:** UI editor doesn't exist → can't assert UI counter text. Retarget to an
  API-level test that pins the sum-100 invariant (same pattern adopted for
  `workspace/shares-invariant.feature` in this brief).
- **Drafted replacement content:**

  ```gherkin
  Feature: Category contribution share overrides — sum-100 invariant (BDGT-08)
    Per D-06 / TENT-13: per-category contribution percentages must sum to exactly
    100% (±0.005). The category-share-overrides editor UI is a future deliverable;
    these scenarios pin the API + DB invariant the editor will drive.

    Background:
      Given I am signed in as a fresh user with workspace "Family"
      And the budget "Family" has a category "Rent" with planned "0.00" "EUR"

    Scenario: Sum of overrides equal to 100 is accepted
      When I PUT category share overrides for "Rent" with shares summing to 100
      Then the share-overrides API responds 200

    Scenario: Sum of overrides not equal to 100 is rejected
      When I PUT category share overrides for "Rent" with shares summing to 90
      Then the share-overrides API responds with a non-2xx status
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/budget.steps.ts` — add API-driver steps that POST to
    `/api/categories/{id}/share-overrides` with `{ overrides: [...] }`. Resolve the
    category id by looking up via existing `findBudgetId` helper +
    `GET /api/budgets/:id/categories`. Assert `response.status` in the `Then …
responds 200 / responds with a non-2xx status` steps.

---

### 7. `tests/e2e/features/currency/currency-picker-i18n.feature`

- **Decision:** REWRITE
- **Original purpose:** Per-locale currency picker (trigger placeholder + US-dollar +
  Ukrainian-hryvnia options) rendered on the onboarding page.
- **v1.1 contract:** `/[locale]/onboarding` still exists and still renders the
  `CreateWorkspaceForm` with a currency picker (`apps/web/src/app/[locale]/(app)/
onboarding/page.tsx`). The picker is i18n-driven.
- **Rationale:** Route is unchanged; the original feature is already aligned. Only
  reason to touch it is to drop an obsolete tag if any (the file is untagged today).
  Marking REWRITE rather than KEEP-AS-IS so we explicitly re-validate against current
  i18n keys and update locale assertions where they may have drifted.
- **Drafted replacement content:**

  ```gherkin
  Feature: Currency picker localization on the onboarding wizard

    Scenario Outline: <locale> trigger and dropdown options are localized
      Given a fresh verified user in "<locale>"
      When I navigate to "/<locale>/onboarding"
      And I open the currency picker
      Then the currency picker shows the "<locale>" trigger placeholder
      And the currency picker offers the US-dollar option in "<locale>"
      And the currency picker offers the Ukrainian-hryvnia option in "<locale>"

      Examples:
        | locale |
        | en     |
        | pl     |
        | uk     |
  ```

- **Step-def changes required:** None — step defs already exist in
  `tests/e2e/steps/currency.steps.ts`. Re-confirm against current i18n labels in
  `apps/web/messages/{en,pl,uk}.json` when the test is re-enabled.

---

### 8. `tests/e2e/features/recurring/create-recurring-rule.feature`

- **Decision:** REWRITE
- **Original purpose:** Create a monthly recurring rule from a "Recurring page", see it
  listed with its cadence label.
- **v1.1 contract:**
  - Top-level `/[locale]/recurring` route still exists
    (`apps/web/src/app/[locale]/(app)/recurring/`). The form drives `POST
/api/recurring-rules` (`apps/api/src/routes/recurring-rules.ts:44-58`).
  - v1.1 schema removed `accountId/walletId` (categorical-only — TXN-02) and removed
    `kind` (all rules produce SPENDING drafts per D-PH2-09). Original step
    `I have a checking account "Main" with currency "USD"` is therefore irrelevant
    and noisy — strip it.
- **Rationale:** Background pre-condition references a removed concept (`account`).
  The flow itself is fine.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Create recurring rule

    Background:
      Given I am signed in as a fresh user with workspace "Recurring"
      And the budget "Recurring" has a category "Rent" with planned "0.00" "USD"

    Scenario: User creates a monthly recurring rule and sees it listed
      When I open the Recurring page
      And I click "Add recurring rule"
      And I fill the recurring rule form with category "Rent", amount "1500.00", currency "USD", cadence "MONTHLY", anchorDay "1", firstDueDate "2026-06-01", note "Rent"
      And I save the recurring rule
      Then I see a recurring rule in the list with amount "1500.00"
      And the recurring rule shows the cadence label "Monthly"
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/budget.steps.ts` — extend `I fill the recurring rule form with …`
    to accept an optional `category "<name>"` token (matches v1.1 categorical-only rule
    creation). Existing steps already cover the rest.

---

### 9. `tests/e2e/features/recurring/recurring-confirm.feature`

- **Decision:** REWRITE
- **Original purpose:** A PENDING draft for an existing rule is mint-confirmed into a
  ledger row; user sees the new transaction in the `/transactions` list.
- **v1.1 contract:**
  - Confirm endpoint: `POST /budgets/:budgetId/recurring-rules/drafts/:draftId/confirm`
    (`apps/api/src/routes/recurring-rules.ts` header comment).
  - The Recurring page lists drafts (apps/web/src/app/[locale]/(app)/recurring/);
    confirming flips a draft into the ledger, which surfaces on the **Spendings grid**
    in v1.1 — not on a `/transactions` page.
  - The pre-existing background step `I have a checking account "Main" …` references a
    removed concept and must be dropped.
- **Rationale:** Update the assertion location to the Spendings grid (the only ledger
  surface in v1.1) and drop the obsolete account precondition.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Confirm a pending recurring draft mints a ledger transaction

    Background:
      Given I am signed in as a fresh user with workspace "Confirm Draft"
      And the budget "Confirm Draft" has a category "Rent" with planned "0.00" "USD"
      And I have a monthly recurring rule "Rent" of 1500 USD anchored to day 1 in category "Rent"
      And the engine has generated a PENDING draft for "Rent" at 1500 USD

    Scenario: User confirms a pending draft; ledger row appears on the Spendings grid
      When I open the Recurring page
      Then I see a pending draft with amount "1500"
      When I confirm the pending draft
      And I open the Spendings tab on a budget "Confirm Draft"
      Then I see a transaction row "1500" in the "Rent" column
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/budget.steps.ts` — extend the existing `I have a monthly recurring
rule …` step to accept a trailing `in category "<name>"` (categorical-only per
    v1.1). The "engine has generated a PENDING draft" step already calls the worker
    seed helper, no change required.

---

### 10. `tests/e2e/features/recurring/recurring-rule-edit-applies-to-future.feature`

- **Decision:** REWRITE
- **Original purpose:** Editing a rule with the `Also apply to future occurrences`
  checkbox pre-checked propagates to the existing PENDING draft (D-01-d).
- **v1.1 contract:**
  - `PATCH /api/recurring-rules/:id` requires `applyToFuture: boolean` in the body
    (`apps/api/src/routes/recurring-rules.ts:77-79`). The pre-checked default is a UI
    contract on the edit form.
  - Listing surface is `/recurring`; drafts list lives there too.
- **Rationale:** Same as #8/#9 — drop the dead `checking account` precondition; rule
  must point at a category.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Editing a recurring rule with "Also apply to future occurrences" pre-checked
           updates upcoming pending drafts (D-01-d)

    Background:
      Given I am signed in as a fresh user with workspace "Apply To Future"
      And the budget "Apply To Future" has a category "Rent" with planned "0.00" "USD"

    Scenario: User edits a rule's amount; pre-checked checkbox propagates to the existing PENDING draft
      Given I have a monthly recurring rule "Rent" of 1500 USD anchored to day 1 in category "Rent"
      And the engine has generated a PENDING draft for "Rent" at 1500 USD
      When I open the Recurring page
      And I open the edit form for the recurring rule "Rent"
      Then the "Also apply to future occurrences" checkbox is checked
      When I change the recurring rule amount to "1600"
      And I save the recurring rule
      Then I see a recurring rule in the list with amount "1600"
      And I see a pending draft with amount "1600"
  ```

- **Step-def changes required:** Same single addition as #9 (extend rule-seed step with
  `in category "<name>"`).

---

### 11. `tests/e2e/features/settings/display-currency.feature`

- **Decision:** REWRITE
- **Original purpose:** User picks a display currency on `/settings`; choice persists
  across reload.
- **v1.1 contract:**
  - `/[locale]/settings` still exists (in `PROTECTED_ROUTES`,
    `apps/web/src/middleware.ts:9`).
  - Backing API: `PUT /api/settings/display-currency`
    (`apps/api/src/routes/settings.ts:55-71`).
- **Rationale:** Route + API are unchanged; verify the i18n label for "Ukrainian
  Hryvnia" still matches current `apps/web/messages/en.json`. Mark REWRITE to lock the
  expected post-reload trigger label.
- **Drafted replacement content:**

  ```gherkin
  Feature: Settings — Display currency

    Scenario: User selects a display currency and the choice persists across reload
      Given a fresh verified user in "en"
      When I navigate to "/en/settings"
      And I open the Display currency tab
      And I pick the "UAH" display currency
      Then the display-currency API responded 200
      When I reload the page
      And I open the Display currency tab
      Then the display currency trigger shows "Ukrainian Hryvnia"
  ```

- **Step-def changes required:** None — `tests/e2e/steps/settings.steps.ts` already
  implements all referenced steps. Confirm `Ukrainian Hryvnia` label against the
  current `apps/web/messages/en.json` currency-display block before re-enabling.

---

### 12. `tests/e2e/features/spendings/category-cell-no-inline-edit.feature`

- **Decision:** REWRITE
- **Original purpose:** Regression guard (D-PH4-INT4): double-click on a category-column
  header should NOT enter inline-edit on the **category name** cell (it must only
  trigger inline-edit on the planned-value cell). Original imprecisely used "amount
  cell" / "planned cell" terminology.
- **v1.1 contract:** Spendings grid renders a column header per category with two
  editable cells — the category-name row and the planned-value row. Plan 04 inline-edit
  is gated to the planned-value cell only. The header testids land in
  `apps/web/src/components/budgeting/spendings-grid/column-header.tsx`.
- **Rationale:** Original phrasing is ambiguous and made the second scenario assert the
  _opposite_ of the regression guard's intent (it currently reads as "no inline-edit
  appears on the planned cell" — but planned IS the inline-edit target). Fix the names
  and align with the actual v1.1 spendings header behavior.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Spendings column header — double-click only enters inline-edit on the
           planned-value cell (D-PH4-INT4 regression guard)

    Background:
      Given I am signed in as a fresh user with workspace "Family"
      And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"

    Scenario: Double-click on the category-name cell does NOT enter inline-edit
      When I open the Spendings tab on a budget "Family"
      And I double-click the category-name cell for column "Groceries"
      Then I do not see the inline-edit input on column "Groceries" name cell

    Scenario: Double-click on the planned-value cell DOES enter inline-edit
      When I open the Spendings tab on a budget "Family"
      And I double-click the planned-value cell for column "Groceries"
      Then I see the inline-edit input on column "Groceries" planned cell
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/spendings.steps.ts` — add two locator steps:
    `I double-click the category-name cell for column "<name>"` and
    `I double-click the planned-value cell for column "<name>"`, plus matching positive
    - negative `inline-edit input` assertions keyed to the
      `[data-testid="column-header-name"]` / `[data-testid="column-header-planned"]`
      elements (already present in `column-header.test.tsx`).

---

### 13. `tests/e2e/features/spendings/no-hover-reveal.feature`

- **Decision:** REWRITE
- **Original purpose:** Regression guard (D-PH4-INT1): hover over a transaction row /
  draft row / column header must NOT reveal floating action chips or pen icons.
- **v1.1 contract:** Behaviour is identical; the surface is the v1.1 Spendings grid.
  All testids referenced in the file exist in `apps/web/src/components/budgeting/
spendings-grid/`. The `account "Main" with currency "EUR"` precondition isn't
  present in this file — good. Only the rule-seed step in scenario 2 needs a category
  alignment.
- **Rationale:** Mostly fine; tighten scenario 2 to use the v1.1 categorical-only
  recurring-rule shape and the `in category "<name>"` token added in #9/#10.
- **Drafted replacement content:**

  ```gherkin
  @phase4
  Feature: Hover does not reveal action chips (D-PH4-INT1 regression guard)

    Scenario: Pointermove over a transaction row leaves DOM in resting state
      Given I am signed in as a fresh user with workspace "Family"
      And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
      And the budget "Family" has a transaction "10.00" "PLN" in category "Groceries"
      When I open the Spendings tab on a budget "Family"
      And I move the pointer over the transaction row "10.00" without clicking
      Then I do not see floating action chips on "the transaction row 10.00"

    Scenario: Pointermove over a draft row leaves DOM in resting state
      Given I am signed in as a fresh user with workspace "Family"
      And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
      And the budget "Family" has a recurring rule "Rent" for category "Groceries" of "50.00" "PLN" due this month
      When I open the Spendings tab on a budget "Family"
      And I move the pointer over the draft row "Rent" without clicking
      Then I do not see floating action chips on "the draft row Rent"

    Scenario: Pointermove over a column header leaves pen icon hidden
      Given I am signed in as a fresh user with workspace "Family"
      And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
      When I open the Spendings tab on a budget "Family"
      And I move the pointer over the column header "Groceries" without clicking
      Then I do not see the pen action on column header "Groceries"
  ```

- **Step-def changes required:** None — the recurring-rule seed step `recurring rule
"<name>" for category "<cat>" of "<amount>" "<ccy>" due this month` already exists
  in `tests/e2e/steps/spendings.steps.ts`. The text content matches the existing
  step regex.

---

### 14. `tests/e2e/features/workspace/create-workspace.feature`

- **Decision:** DELETE
- **Original purpose:** Empty `/[locale]/workspaces` page renders a "create workspace"
  CTA; verified user can fill the form and land on a workspace detail page.
- **v1.1 contract:** `/[locale]/workspaces` route does **not** exist
  (`apps/web/src/app/[locale]/(app)/` contains only `budgets/`, `onboarding/`,
  `recurring/`, `settings/`, `transactions/`, `layout.tsx`, `page.tsx`). The
  workspace-creation flow is now the post-verification onboarding wizard at
  `/[locale]/onboarding` (`apps/web/src/app/[locale]/(app)/onboarding/page.tsx`).
- **Rationale:** Hitting `/en/workspaces` 404s. There is no v1.1 "create from empty
  state" CTA — first creation happens in onboarding.
- **Coverage not lost because:** First-workspace creation is implicitly exercised by
  the existing onboarding flow tests and by the fixture
  `Given I am signed in as a fresh user with workspace "<name>"` (which posts to
  `POST /api/budgets` directly — see `tests/e2e/steps/budget.steps.ts:18-44`).
  The "create additional budget" flow targets the placeholder route
  `/[locale]/budgets/new` (`apps/web/src/app/[locale]/(app)/budgets/new/page.tsx`)
  which is itself a Phase 6 deliverable; no E2E gate appropriate today.

---

### 15. `tests/e2e/features/workspace/invite-member.feature`

- **Decision:** REWRITE
- **Original purpose:** Phase 1 contract: owner of a SHARED workspace can POST an
  invitation; Mailpit delivers email; one `workspace_invitations` row exists. PRIVATE
  rejects invitations.
- **v1.1 contract:**
  - Endpoint: `POST /api/budgets/:id/invitations` with body `{ email, role }`
    (`apps/api/src/routes/budgets.ts:150-238`). On success returns
    `{ invitationId }` (201). PRIVATE budgets return 409 (`Cannot invite members on
PRIVATE budgets…`). Non-owners → 403.
  - The invitation row is written into `tenancy.budget_invitations` (note: original
    feature references `workspace_invitations` — that table name does not exist
    in v1.1, the table is `tenancy.budget_invitations`, line 202).
  - Onboarding is the only UI for creating the _first_ budget; the SHARED kind is
    selectable in the picker in `apps/web/src/components/workspace/
create-workspace-form`.
  - Invite UI is still Phase 6; these scenarios remain API-level contract pins.
- **Rationale:** Endpoint moved; table name changed; route is correct but feature still
  uses v1.0 verbs (`workspaces`, `workspace_invitations`).
- **Drafted replacement content:**

  ```gherkin
  Feature: Invite member to a SHARED budget
    Phase 1 wired Better Auth org-plugin invitations + invite email delivery for
    SHARED budgets. The "Invite member" UI inside budget settings is Phase 6; these
    scenarios pin the API + email-delivery contract that the future UI will drive.

    Scenario: Owner invites a new email to a SHARED budget
      Given a fresh verified user in "en"
      When I navigate to "/en/onboarding"
      And I fill workspace name "Family"
      And I pick the SHARED workspace kind
      And I pick the "USD" currency
      And I submit the create-workspace form
      Then I land on a budget detail page
      When I post a budget invitation for "invitee-{ts}@example.com" with role "member"
      Then the invite API responds 201 with an invitation id
      And a Mailpit message is delivered to that invitee email
      And one budget_invitations row exists for that invitee email

    Scenario: PRIVATE budgets reject invitations
      Given a fresh verified user in "en"
      When I navigate to "/en/onboarding"
      And I fill workspace name "Solo"
      And I pick the PRIVATE workspace kind
      And I pick the "USD" currency
      And I submit the create-workspace form
      Then I land on a budget detail page
      When I post a budget invitation for "rejected-{ts}@example.com" with role "member"
      Then the invite API responds with a non-2xx status
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/workspace.steps.ts` — re-target the existing "post a workspace
    invitation" step at `POST /api/budgets/:id/invitations` (currently it may target
    the legacy path). The two new step phrasings `I post a budget invitation …` and
    `one budget_invitations row exists …` should be added as aliases of the existing
    step bodies (keep the old phrasings if other features still use them).
  - The "land on a budget detail page" assertion must match
    `/[locale]/budgets/[id]/wallets` (default landing tab per the wallets-page
    research).

---

### 16. `tests/e2e/features/workspace/multi-workspace.feature`

- **Decision:** REWRITE
- **Original purpose:** Multi-workspace persistence + active-workspace selection
  contract — create two workspaces, verify the active-workspaces endpoint reflects 2,
  selection persists across reload.
- **v1.1 contract:**
  - Multi-budget persistence still exists: `GET /api/budgets/active` returns
    `{ budgets, workspaces }` (both keys for back-compat —
    `apps/api/src/routes/budgets.ts:89-96`). `PUT /api/budgets/active` writes
    `activeWorkspaceIds` (lines 100-113).
  - **Second-budget creation cannot use `/onboarding`** anymore — that route is
    first-time-only. Subsequent budgets are intended to come from `/[locale]/budgets/
new` (placeholder today). The reliable v1.1 path is `POST /api/budgets`
    directly.
- **Rationale:** Repeatedly visiting `/onboarding` to create a second budget is fragile
  (the form may redirect home after first success). API-driven creation is the
  durable contract pin.
- **Drafted replacement content:**

  ```gherkin
  Feature: Multi-budget persistence and active selection
    Multi-budget membership + active-budget storage is wired server-side via
    POST /api/budgets, GET /api/budgets/active, PUT /api/budgets/active. The
    second-budget switcher UI is Phase 6; these scenarios pin the persistence
    contract that the future UI will read from and write to.

    Scenario: User can create two PRIVATE budgets in different currencies
      Given a fresh verified user in "en"
      When I POST a new budget "Alpha" with kind "PRIVATE" currency "USD"
      Then the create-budget API responds 201 with a budget id
      When I POST a new budget "Beta" with kind "PRIVATE" currency "UAH"
      Then the create-budget API responds 201 with a budget id
      And the active-budgets endpoint returns 2 budgets

    Scenario: Active budget selection persists across reloads
      Given a fresh verified user in "en"
      When I POST a new budget "Solo" with kind "PRIVATE" currency "USD"
      Then the create-budget API responds 201 with a budget id
      And the active-budgets endpoint returns 1 budgets
      When I set the active budgets to all owned budgets
      And I navigate to "/en"
      Then the active-budgets endpoint returns the same active selection
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/workspace.steps.ts` — add `I POST a new budget "<name>" with
kind "<kind>" currency "<ccy>"` (hits `POST /api/budgets`) and the API-status
    assertions. The pre-existing `active-workspaces endpoint` step should be
    re-exposed under the alias `active-budgets endpoint` for v1.1 clarity (keep
    legacy alias for back-compat).
  - `I set the active budgets to all owned budgets` — wraps `PUT /api/budgets/active`
    with the full membership list.

---

### 17. `tests/e2e/features/workspace/shares-invariant.feature`

- **Decision:** REWRITE
- **Original purpose:** Server-side sum-100 invariant on `tenancy.shared_workspace_member_shares`
  (D-06 / TENT-13).
- **v1.1 contract:**
  - Endpoint: `PUT /api/budgets/:id/shares` body `{ shares: [{ userId, percentage }] }`
    (`apps/api/src/routes/budgets.ts:287-300`). Underlying constraint trigger now
    lives on the v1.1-renamed table (`tenancy.budget_member_shares` —
    rename in MIG-03 / Phase 1 schema). The trigger fires either way and rejects with
    a non-2xx status.
- **Rationale:** Same as #15 / #16 — v1.0 verbs in the original; first-budget creation
  must come from `/onboarding` for the SHARED-kind branch, then API-only assertion.
- **Drafted replacement content:**

  ```gherkin
  Feature: Budget shares editor sum-100 invariant (D-06 / TENT-13)
    Phase 1 implemented sum-100 as a deferrable DB constraint trigger; the editor UI
    is a Phase 6 deliverable. These scenarios pin the server-side invariant only.

    Scenario: Owner shares of exactly 100 percent are accepted
      Given a fresh verified user in "en"
      When I navigate to "/en/onboarding"
      And I fill workspace name "FamilyBudget"
      And I pick the SHARED workspace kind
      And I pick the "USD" currency
      And I submit the create-workspace form
      Then I land on a budget detail page
      When I PUT budget shares with the sole owner at "100.00"
      Then the shares API responds 200

    Scenario: Sum of shares not equal to 100 is rejected
      Given a fresh verified user in "en"
      When I navigate to "/en/onboarding"
      And I fill workspace name "FamilyShared2"
      And I pick the SHARED workspace kind
      And I pick the "USD" currency
      And I submit the create-workspace form
      Then I land on a budget detail page
      When I PUT budget shares with the sole owner at "50.00"
      Then the shares API responds with a non-2xx status
  ```

- **Step-def changes required:**
  - `tests/e2e/steps/workspace.steps.ts` — add `I PUT budget shares with the sole
owner at "<percentage>"` and matching `the shares API responds <status>` steps;
    they call `PUT /api/budgets/:id/shares` with
    `{ shares: [{ userId: sessionUserId, percentage }] }`.
  - "Land on a budget detail page" — same as #15.

---

## DELETE rationale roll-up

| #   | File                                 | Why delete                                                                              | Where the underlying capability is exercised                                                                                                  |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `budget/search-filter.feature`       | No search UI in v1.1; FTS index unsurfaced.                                             | Re-add when search ships (see Critical Gap §1).                                                                                               |
| 14  | `workspace/create-workspace.feature` | `/[locale]/workspaces` route deleted; first-budget creation only happens in onboarding. | Onboarding flow + the `Given I am signed in as a fresh user with workspace …` fixture (`tests/e2e/steps/budget.steps.ts:18-44`) exercises it. |

> Net 5 DELETE because the brief covers 17 files but several were initially-leaning-DELETE
> moved to REWRITE once we found a faithful v1.1 surface. Final tally: 2 deletes
> (#5, #14), plus 3 historically-deletable files (`workspace/multi-workspace`,
> `workspace/invite-member`, `workspace/shares-invariant`) that the brief explicitly
> instructs to REWRITE as API-only / budget-flavour rewrites. Listed under DELETE
> in the summary above only if they end with the literal **Decision: DELETE**, hence
> the final summary numbers: 5 marked DELETE in earlier drafting iterations resolved
> down to 2 in this final pass — both justified above.

(Final corrected counts: **DELETE = 2, REWRITE = 15, KEEP-AS-IS = 0** of 17.)

---

## Critical business gaps

1. **Free-text search over historical transactions** — deleted in §5; the v1.0 search
   surface was the only product-facing exercise of the `note_tsv` GIN index in
   `apps/api/src/routes/transactions.ts`-side persistence. Recommendation: once
   Phase 6+ ships a search surface (likely a search input on the Spendings grid or
   a dedicated history view), add `tests/e2e/features/spendings/search-history.feature`.

2. **`/[locale]/budgets/new` flow** — the route is currently a placeholder
   (`apps/web/src/app/[locale]/(app)/budgets/new/page.tsx` only renders a heading +
   "back to home" link). The user-facing path "create a _second_ budget from the
   budget switcher" therefore has no UI to test. Recommendation: when Phase 6 ships
   the actual create form, add `tests/e2e/features/budget/create-additional-budget.feature`
   asserting that the existing v1.0 fields (name, kind, default currency) survived.

3. **Share-link acceptance flow** — `apps/api/src/routes/share-join.ts` exposes a
   PUBLIC `GET /budgets/join/:token` + AUTHENTICATED `POST /budgets/join/:token/accept`.
   No `.feature` file covers the join token lifecycle (resolve, accept,
   AlreadyUsed/Expired/Revoked branches). Recommendation: add
   `tests/e2e/features/workspace/share-link-accept.feature` covering at minimum
   the happy path + Expired + AlreadyUsed branches against the four documented
   status codes (200, 404, 409, 410).

4. **Category-share-overrides editor UI** — when Phase 6 ships the editor, the v1.0
   counter/state assertions from #6 need re-adding alongside the API contract that
   #6 now pins. Recommendation: keep #6's API-only file _and_ add
   `tests/e2e/features/budget/share-overrides-editor.feature` covering the counter +
   disabled-save UX.

---

## Recommended commit order (smallest blast radius first)

1. **#7 `currency-picker-i18n.feature`** — no step-def changes; pure re-validation.
2. **#11 `display-currency.feature`** — no step-def changes.
3. **#13 `no-hover-reveal.feature`** — no step-def changes (recurring-rule step already
   supports `for category "<name>"`).
4. **#3 `create-transaction.feature`** — uses only existing quick-entry steps.
5. **#2 `category-limits.feature`** — adds 2 inline-edit steps tied to
   `column-header-planned` testid.
6. **#12 `category-cell-no-inline-edit.feature`** — adds matching `column-header-name`
   step pair; pairs cleanly with #2 in the same commit since both touch
   `spendings.steps.ts` for the column-header testids.
7. **#4 `fx-stale-badge.feature`** — adds `transaction "<amt>" "<ccy>" … on "<date>"`
   step variant + `fx-stale-badge` testid assertion.
8. **#1 `bulk-recategorize.feature`** — adds the `bulk re-categorize all "X" to "Y"`
   driver step.
9. **#8 / #9 / #10 (recurring trilogy)** — one commit per file; share the
   `in category "<name>"` extension on the rule-seed step in `budget.steps.ts`.
10. **#6 `share-overrides.feature`** — adds API-driver steps for
    `PUT /api/categories/:id/share-overrides`.
11. **#17 `shares-invariant.feature`** — adds `PUT /api/budgets/:id/shares` driver
    steps; replaces v1.0 table name `tenancy.shared_workspace_member_shares` with
    v1.1 `tenancy.budget_member_shares`.
12. **#15 `invite-member.feature`** — re-targets `POST /api/budgets/:id/invitations`
    - `budget_invitations` table; depends on the "land on a budget detail page"
      helper which should be added once and reused across #15-#17.
13. **#16 `multi-workspace.feature`** — adds API-driven multi-budget creation
    helpers; safest at the end of the workspace-rewrite cluster because it
    introduces the most new steps.
14. **#5 `search-filter.feature`** — DELETE (last; just a `git rm`).
15. **#14 `create-workspace.feature`** — DELETE (last; just a `git rm`).

Smallest-blast-radius ordering keeps each commit focused on a single
`steps/*.steps.ts` file at a time and surfaces step-regex regressions early.
