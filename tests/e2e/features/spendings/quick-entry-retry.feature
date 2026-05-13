@phase4
Feature: Quick-entry retry on API failure (D-PH4-Q1)

  Scenario: Failed quick-entry shows retry icon; clicking retry succeeds
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I type "30.00" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    Then I see a transaction row "30.00" in the "Groceries" column
