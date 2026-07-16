@phase8
Feature: Spendings grid — desktop keyboard navigation (r40b)

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a category "Rent" with a monthly limit of 100000 cents

  Scenario: Arrows walk rows, hop columns and reveal chips; Enter edits, Backspace deletes
    When I open the spendings tab for the budget
    And I type a quick-entry of "500" cents into the "Groceries" column
    And I type a quick-entry of "700" cents into the "Groceries" column
    And I type a quick-entry of "900" cents into the "Rent" column
    Then a confirmed transaction row for 500 cents is visible in the grid
    And a confirmed transaction row for 700 cents is visible in the grid
    And a confirmed transaction row for 900 cents is visible in the grid
    When I focus the "Groceries" quick input
    And I press "ArrowUp" in the grid
    Then a transaction row is focused
    And the focused row shows its action chips
    And the "Groceries" column has the focused row
    When I press "ArrowRight" in the grid
    Then a transaction row is focused
    And the "Rent" column has the focused row
    When I press "ArrowLeft" in the grid
    Then the "Groceries" column has the focused row
    When I press "Enter" in the grid
    Then the row amount editor is open
    When I press "Escape" in the grid
    And I press "Backspace" in the grid
    Then the delete confirmation dialog is visible

  Scenario: Left/Right at a quick-input edge saves the entry and moves to the neighbouring column
    When I open the spendings tab for the budget
    And I focus the "Groceries" quick input
    And I type "3.00" into the focused quick input
    And I press "ArrowRight" in the grid
    Then the "rent" quick input is focused
    And a confirmed transaction row for 300 cents is visible in the grid

  Scenario: Type-ahead jumps to the uniquely-identified category's quick input
    Given the budget has a category "Housing" with a monthly limit of 100000 cents
    And the budget has a category "Food & Home" with a monthly limit of 100000 cents
    When I open the spendings tab for the budget
    And I type the letters "hom" in the grid
    Then the "food & home" quick input is focused
    When I type the letters "g" in the grid
    Then the "groceries" quick input is focused
