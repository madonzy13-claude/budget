@phase4
Feature: Capture a transaction from the Spendings grid

  Scenario: User captures an EUR expense via quick-entry on the Spendings grid
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I type "50.00" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    Then I see a transaction row "50.00" in the "Groceries" column
    # centsToBare trims trailing .00 by design (UAT-PH5-T3-29).
    And I see the column "Groceries" header balance shows "150"
