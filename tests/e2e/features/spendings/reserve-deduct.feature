@phase4
Feature: Real-time reserve deduction on quick-entry (RSCM-03)

  Scenario: Spending over budget draws from reserve; header rows update in real time
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "100.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I type "95.00" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    Then I see a transaction row "95" in the "Groceries" column
    And I see the column "Groceries" header balance shows "5"
