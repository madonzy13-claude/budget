@phase8
Feature: Spendings tab — quick-entry

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents

  Scenario: Quick-entry transaction appears in the grid
    When I open the spendings tab for "My E2E Budget"
    And I type a quick-entry of "500" cents into the "Groceries" column
    Then a confirmed transaction row for 500 cents is visible in the grid

