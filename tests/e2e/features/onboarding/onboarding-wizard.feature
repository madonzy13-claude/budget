@phase6
Feature: Onboarding Wizard — 5-step wizard + resume from saved progress (ONBD-01..09)

  Scenario: Fresh user walks all 5 steps and lands on spendings tab
    Given I am a fresh user with no prior budget
    When I navigate to the onboarding wizard
    And I fill in the budget name "Family Budget"
    And I click Next
    And I pick the currency "EUR"
    And I click Next
    And I pick the budget type "personal"
    And I click Next
    And I toggle at least one starter category
    And I click Next
    Then I see the review step
    When I click Create budget
    Then I land on the budget spendings page

  Scenario: Wizard is resumable — refresh mid-wizard returns to the saved step
    Given I am a fresh user with no prior budget
    When I navigate to the onboarding wizard
    And I fill in the budget name "Resumable Budget"
    And I click Next
    And I reload the page
    Then the wizard is still on step 2

  Scenario: Selecting starter categories creates them in the new budget
    Given I am a fresh user with no prior budget
    When I navigate to the onboarding wizard
    And I fill in the budget name "Category Test Budget"
    And I click Next
    And I pick the currency "EUR"
    And I click Next
    And I pick the budget type "personal"
    And I click Next
    And I toggle at least one starter category
    And I click Next
    And I click Create budget
    Then I land on the budget spendings page
    And the spendings grid has at least one category row
