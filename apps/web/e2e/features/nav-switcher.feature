Feature: Budget switcher in top nav
  # Covers NAV-01 (trigger anatomy), NAV-02 (Personal/Shared grouping),
  # NAV-03 (+ button), NAV-04 (route on click).

  Background:
    Given I am signed in as a fresh user

  Scenario: Switcher trigger shows current budget name + chevron
    When I open the home page
    Then the switcher trigger displays the active budget name

  Scenario: Dropdown groups budgets as Personal / Shared
    When I open the home page
    And I open the budget switcher
    Then I see the "Personal" budget section
    # SHARED section only renders when at least one SHARED budget exists; fresh user starts with PRIVATE only
    And I do not see the "Shared" budget section

  Scenario: Click + button navigates to /budgets/new
    When I open the home page
    And I click the "+" new-budget button
    Then the URL contains "/budgets/new"

  Scenario: Selecting a budget routes to its spendings tab
    When I open the home page
    And I open the budget switcher
    And I click the row for "My E2E Budget"
    Then the URL contains "/budgets/" followed by the budget id and "/spendings"
