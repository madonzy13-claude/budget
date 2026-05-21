@phase4
Feature: Category effective-dated budget limits (BDGT-03..05)

  Scenario: User sets a planned limit on a category from the Spendings grid header
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Spendings tab on a budget "Family"
    And I create a category "Housing"
    And I set the planned limit for column "Housing" to "1000.00"
    Then the column "Housing" header shows planned "1,000"

  Scenario: A persisted planned limit survives a page reload
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Spendings tab on a budget "Family"
    And I create a category "Groceries"
    And I set the planned limit for column "Groceries" to "500.00"
    And I reload the page
    Then the column "Groceries" header shows planned "500"
