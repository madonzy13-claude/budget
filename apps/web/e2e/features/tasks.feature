@tasks-redesign
Feature: Tasks redesign — home badge + per-pill badge + per-pill slider

  Background:
    Given I am signed in as a fresh user

  # ───────────────────────────────────────────────────────────────────────
  # Switcher row badges
  # ───────────────────────────────────────────────────────────────────────
  # r35 + Task 16: the home page no longer shows per-budget cards (≥2 budgets
  # render the AggregateOverview). The per-budget pending-task count badge now
  # lives on each row of the header budget switcher (PillBadge on switcher-row).
  Scenario: Switcher row shows red badge "3" for a budget with 3 pending tasks
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    And a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the home page
    And I open the budget switcher
    Then the switcher row for "My E2E Budget" shows a pending tasks badge "3"

  Scenario: Switcher row shows no badge for a budget with 0 pending tasks
    When I open the home page
    And I open the budget switcher
    Then the switcher row for "My E2E Budget" shows no pending tasks badge

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
  # Per-pill slider — always-collapsed (UAT round 2)
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Reserves slider with 1 task starts collapsed; click expands; row visible
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the reserves tab for "My E2E Budget"
    Then the reserves pill slider is collapsed
    When I click the reserves pill slider header
    Then the reserves pill slider shows 1 row

  # NOTE: "≥2 tasks collapsed" hybrid-expand path is unit-tested in
  # apps/web/test/components/budgeting/tasks/pill-task-slider.test.tsx —
  # E2E coverage is structurally impossible because each pill maps 1:1 to
  # a single task kind, and the partial unique index
  # tasks_<kind>_pending_uq enforces one-PENDING-per-(kind, budget_id).

  # ───────────────────────────────────────────────────────────────────────
  # UAT round 2: rows are read-only — no click navigation, no inline POST.
  # The user reads the row title, optionally opens "More" for guidance, and
  # fixes the problem through the existing pill surfaces. The action-routing
  # scenarios from UAT round 1 are dropped; the @skip-phase-07-debt
  # CONFIRM_DRAFT inline-collapse scenario is also removed (no inline action).
  # ───────────────────────────────────────────────────────────────────────

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
