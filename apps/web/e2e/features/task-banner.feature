@phase7
Feature: Task banner — emit, act, auto-resolve per kind
  # Covers BDP-03 + Phase 7 D-PH7-25/29: emit→action→auto-resolve flow for the
  # 3 task kinds (RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET).
  # Replaces the Phase 3 "disabled" contract; the action button is now enabled
  # and routes per-kind (deep-link OR inline mutation).

  Background:
    Given I am signed in as a fresh user

  Scenario: Banner is absent from DOM when no pending tasks
    When I open the BDP for "My E2E Budget"
    Then the task banner is not present in the DOM

  # ------------------------------------------------------------------
  # RESERVE_TOPUP — deep-link
  # ------------------------------------------------------------------
  Scenario: RESERVE_TOPUP task shows correct title and routes to /reserves on action
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    And I click the task banner
    Then I see a task with title "Top up reserve by €50.00"
    And the action button label is "Fix reserve"
    When I click the task action button
    Then I am navigated to the reserves tab
    And the URL contains "task="

  Scenario: RESERVE_TOPUP task auto-resolves when reserve task is resolved server-side
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And the seeded task is resolved server-side
    When I open the BDP for "My E2E Budget"
    Then within 90 seconds the task banner is not present in the DOM

  # ------------------------------------------------------------------
  # CONFIRM_DRAFT — inline action + optimistic collapse
  # ------------------------------------------------------------------
  Scenario: CONFIRM_DRAFT task shows correct title and action label
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    And I click the task banner
    Then I see a task with title containing "Rent" and "€1,000.00"
    And the action button label is "Confirm draft"

  Scenario: CONFIRM_DRAFT task auto-resolves when resolved server-side
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    And the seeded task is resolved server-side
    When I open the BDP for "My E2E Budget"
    Then within 90 seconds the task banner is not present in the DOM

  # ------------------------------------------------------------------
  # CUSHION_BELOW_TARGET — deep-link with focus=cushion query param
  # ------------------------------------------------------------------
  Scenario: CUSHION_BELOW_TARGET routes to /wallets with cushion focus on action
    Given a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    And I click the task banner
    Then I see a task with title containing "Cushion short by" and "€30.00"
    And the action button label is "Top up cushion"
    When I click the task action button
    Then I am navigated to the wallets tab
    And the URL contains "focus=cushion"

  Scenario: CUSHION_BELOW_TARGET auto-resolves when resolved server-side
    Given a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    And the seeded task is resolved server-side
    When I open the BDP for "My E2E Budget"
    Then within 90 seconds the task banner is not present in the DOM

  # ------------------------------------------------------------------
  # Dedup
  # ------------------------------------------------------------------
  @skip-phase-07-debt
  # NOTE: Phase 7 dedup is enforced via the budgeting.tasks_unique_pending
  # partial index on (kind, budget_id, status='PENDING') plus payload hash.
  # End-to-end seeding two payload-identical rows from the test goes through
  # `INSERT ON CONFLICT DO NOTHING` in production code; the SQL test helper
  # currently bypasses that path. Re-enable once the helper is moved through
  # the dedup-aware repository method (tracked in 07-10 deferred-items).
  Scenario: Two emit attempts for the same RESERVE_TOPUP shortfall produce one task
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a second emit attempt is made for the same shortfall
    When I open the BDP for "My E2E Budget"
    And I click the task banner
    Then the expanded list shows 1 task row

  # ------------------------------------------------------------------
  # Settings cushion months input — persists via PATCH
  # ------------------------------------------------------------------
  Scenario: Cushion target months input persists and is reflected in Settings
    Given the budget "My E2E Budget" has cushion enabled with target 6 months
    When I open the BDP settings tab for "My E2E Budget"
    And I open the cushion section
    And I change the cushion target months to 12
    Then within 5 seconds the cushion target months input shows 12

  # ------------------------------------------------------------------
  # Mobile viewport sanity
  # ------------------------------------------------------------------
  Scenario: Banner renders correctly on a phone-sized viewport
    Given I am on a phone-sized viewport
    And a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the task banner displays "1 task pending"
