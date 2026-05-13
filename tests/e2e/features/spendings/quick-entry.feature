@phase4
Feature: Quick-entry expense from Spendings grid

  Scenario: User adds a PLN expense by typing into the Groceries column
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
    When I open the Spendings tab on a budget "Family"
    And I type "12.50" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    Then I see a transaction row "12.50" in the "Groceries" column
    And I see the column "Groceries" header balance shows "187.50"
