@phase8
Feature: Spendings grid — desktop keyboard navigation

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a category "Rent" with a monthly limit of 100000 cents

  Scenario: Tab cycles quick-add inputs; arrows, Enter and Backspace drive rows
    When I open the spendings tab for the budget
    And I type a quick-entry of "500" cents into the "Groceries" column
    And I type a quick-entry of "700" cents into the "Groceries" column
    Then a confirmed transaction row for 500 cents is visible in the grid
    And a confirmed transaction row for 700 cents is visible in the grid
    When I focus the "Groceries" quick input
    And I press "Tab" in the grid
    Then the "rent" quick input is focused
    When I press "Shift+Tab" in the grid
    Then the "groceries" quick input is focused
    When I press "ArrowDown" in the grid
    Then a transaction row is focused
    When I press "Enter" in the grid
    Then the row amount editor is open
    When I press "Escape" in the grid
    And I focus the "Groceries" quick input
    And I press "ArrowDown" in the grid
    And I press "Backspace" in the grid
    Then the delete confirmation dialog is visible
