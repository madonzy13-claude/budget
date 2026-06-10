@phase4
Feature: Quick-entry in past month saves with last day of that month (GRID-11, D-PH4-Q5)

  Scenario: Navigating to previous month and entering an amount saves correctly
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Utilities" with planned "100.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I am viewing month "2026-04"
    And I type "5.96" into the quick-entry input for category "Utilities"
    And I press Enter in the quick-entry input
    Then I see a transaction row "5.96" in the "Utilities" column
