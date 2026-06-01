@tasks-redesign
Feature: Tasks redesign — home badge + per-pill badge + per-pill slider

  Background:
    Given I am signed in as a fresh user

  # ───────────────────────────────────────────────────────────────────────
  # Home page badges
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Home shows red badge "3" on a budget card with 3 pending tasks
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    And a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the home page
    Then the budget card for "My E2E Budget" shows a pending tasks badge "3"

  Scenario: Home shows no badge on a budget with 0 pending tasks
    When I open the home page
    Then the budget card for "My E2E Budget" shows no pending tasks badge

  # ───────────────────────────────────────────────────────────────────────
  # BDP pill badges
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Reserves pill shows red "1" badge for one RESERVE_TOPUP
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the reserves pill shows a badge "1"
    And the wallets pill shows no badge
    And the spendings pill shows no badge
    And the settings pill shows no badge

  Scenario: Wallets pill shows red "1" badge for one CUSHION_BELOW_TARGET
    Given a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the wallets pill shows a badge "1"
    And the reserves pill shows no badge

  Scenario: Spendings pill shows red "1" badge for one CONFIRM_DRAFT
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the spendings pill shows a badge "1"

  Scenario: Settings pill never shows a badge in current scope
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    And a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the settings pill shows no badge

  # ───────────────────────────────────────────────────────────────────────
  # Per-pill slider — hybrid expand rule
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Reserves slider with 1 task mounts expanded
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the reserves tab for "My E2E Budget"
    Then the reserves pill slider is expanded
    And the reserves pill slider shows 1 row

  # NOTE: "≥2 tasks collapsed" hybrid-expand path is unit-tested in
  # apps/web/test/components/budgeting/tasks/pill-task-slider.test.tsx —
  # E2E coverage is structurally impossible because each pill maps 1:1 to
  # a single task kind, and the partial unique index
  # tasks_<kind>_pending_uq enforces one-PENDING-per-(kind, budget_id).

  # ───────────────────────────────────────────────────────────────────────
  # Per-kind action routing
  # ───────────────────────────────────────────────────────────────────────
  Scenario: RESERVE_TOPUP action navigates to /reserves?task=<id>
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the reserves tab for "My E2E Budget"
    And I click the reserves pill slider action button
    Then I am navigated to the reserves tab
    And the URL contains "task="

  Scenario: CUSHION_BELOW_TARGET action navigates to /wallets with focus=cushion
    Given a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the wallets tab for "My E2E Budget"
    And I click the wallets pill slider action button
    Then I am navigated to the wallets tab
    And the URL contains "focus=cushion"

  # NOTE: CONFIRM_DRAFT action requires task.payload.draft_id (expense_ledger row
  # id). E2E seed only inserts rule_name/amount_cents — no draft row is created,
  # so POST /recurring-rules/drafts/:id/confirm returns 404 and onResolved is
  # never called. Creating a full draft requires a recurring_rule + expense_ledger
  # row, which is out of scope for E2E seed helpers. Unit-tested in
  # apps/web/test/components/budgeting/tasks/pill-task-slider.test.tsx.
  @skip-phase-07-debt
  Scenario: CONFIRM_DRAFT inline action collapses row within 5s
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the spendings tab for "My E2E Budget"
    And I click the spendings pill slider action button
    Then within 5 seconds the spendings pill slider is not present in the DOM

  # ───────────────────────────────────────────────────────────────────────
  # Auto-resolve
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Server-side resolve removes the slider within 90s
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And the seeded task is resolved server-side
    When I open the reserves tab for "My E2E Budget"
    Then within 90 seconds the reserves pill slider is not present in the DOM

  # ───────────────────────────────────────────────────────────────────────
  # Mobile sanity
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Phone-sized viewport — pill bar wraps and badges still visible
    Given I am on a phone-sized viewport
    And a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the reserves pill shows a badge "1"

  # ───────────────────────────────────────────────────────────────────────
  # Dedup (carried over from Phase 7 deferred-items.md — unchanged scenario)
  # ───────────────────────────────────────────────────────────────────────
  @skip-phase-07-debt
  Scenario: Two emit attempts for the same RESERVE_TOPUP shortfall produce one task
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a second emit attempt is made for the same shortfall
    When I open the reserves tab for "My E2E Budget"
    Then the reserves pill slider shows 1 row
