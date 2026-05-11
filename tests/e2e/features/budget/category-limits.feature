@phase2
Feature: Category budget limits

  Scenario: User sets a budget limit on a category
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Budget page
    And I create a category "Housing"
    And I open the limit editor for "Housing"
    And I set the normal limit to "100000" and cushion limit to "110000" in "EUR" effective "2026-01-01"
    And I save the limit
    Then I see "Housing" in the categories list

  Scenario: Budget limit save is persisted and effective lookup works
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Budget page
    And I create a category "Groceries"
    And I open the limit editor for "Groceries"
    And I set the normal limit to "50000" and cushion limit to "60000" in "EUR" effective "2026-05-01"
    And I save the limit
    Then "Groceries" shows a saved limit
