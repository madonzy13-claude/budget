Feature: Budget switcher in top nav
  # Covers NAV-01 (trigger anatomy), NAV-02 (Personal/Shared grouping),
  # NAV-03 (+ button), NAV-04 (route on click).

  Background:
    Given I am signed in as a fresh user

  # UAT-PH5-T2-03: header "+" button was replaced by a "Create budget" row
  # at the bottom of the switcher dropdown. UAT-PH5-T3-13 also gates the
  # trigger label on the URL-derived activeBudgetId — the home page (/en) has
  # none, so the trigger renders chevron-only there. The first two scenarios
  # below now visit the BDP (wallets tab) so the trigger has an active budget
  # to surface.

  Scenario: Switcher trigger shows current budget name + chevron
    When I open the BDP wallets tab for "My E2E Budget"
    Then the switcher trigger displays the active budget name

  @skip-phase-05-debt
  # UAT-PH5-T3-13: the "Personal" heading only renders when there is also at
  # least one SHARED budget (line 133, budget-switcher.tsx). A fresh user
  # starts with one PRIVATE budget and no SHARED, so the heading is omitted.
  # Re-enable once we seed a SHARED budget in the fixture or split this into
  # two scenarios (one-group vs two-group).
  Scenario: Dropdown groups budgets as Personal / Shared
    When I open the BDP wallets tab for "My E2E Budget"
    And I open the budget switcher
    Then I see the "Personal" budget section
    And I do not see the "Shared" budget section

  Scenario: Create budget CTA at end of dropdown navigates to /budgets/new
    When I open the BDP wallets tab for "My E2E Budget"
    And I open the budget switcher
    And I click the "Create budget" row in the switcher dropdown
    Then the URL contains "/budgets/new"

  Scenario: Selecting a budget routes to its wallets tab
    When I open the home page
    And I open the budget switcher
    And I click the row for "My E2E Budget"
    Then the URL contains "/budgets/" followed by the budget id and "/wallets"
