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
