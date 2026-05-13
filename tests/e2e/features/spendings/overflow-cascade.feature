@phase4
Feature: Overflow cascade when reserve exhausted (RSCM-04)

  Scenario: Spending beyond budget and reserve shows overflow in overspent row
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "100.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I type "90.00" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    Then I see a transaction row "90.00" in the "Groceries" column
    And I see the column "Groceries" header balance shows "10.00"
    When I type "50.00" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    Then I see a transaction row "50.00" in the "Groceries" column
    And I see the column "Groceries" header overspent shows "40.00"
