@phase4
Feature: Double-click on category cells does NOT trigger inline-edit (D-PH4-INT4 regression-guard)

  Scenario: Double-click on category column header does not enter inline-edit mode
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I double-click the amount cell on transaction "Groceries"
    Then I do not see the inline-edit input on "Groceries header"

  Scenario: Double-click on the planned value cell in the header does not enter inline-edit mode
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    Then I do not see the inline-edit input on "Groceries planned cell"
