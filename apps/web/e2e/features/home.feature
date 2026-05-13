Feature: Combined home page
  # Covers HOME-01 (one card per budget), HOME-03 (card click -> spendings),
  # HOME-04 (placeholder chart) plus empty-state HOME-01.

  Background:
    Given I am signed in as a fresh user

  Scenario: Home renders one BudgetCard per accessible budget
    When I open the home page
    Then I see a budget card titled "My E2E Budget"

  Scenario: Card click navigates to /budgets/[id]/spendings
    When I open the home page
    And I click the card for "My E2E Budget"
    Then the URL ends with "/spendings"

  Scenario: Placeholder chart card is visible below the grid
    When I open the home page
    Then I see the "Insights coming soon" placeholder chart

  Scenario: Empty home state shows hero CTA when user has no budgets
    Given I am a signed-in user with no budgets
    When I open the home page
    Then I see the "Create your first budget" CTA
