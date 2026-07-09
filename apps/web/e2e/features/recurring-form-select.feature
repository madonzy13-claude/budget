@recurring-form-select
Feature: Recurring-rule category dropdown closes on re-click
  # r33 follow-up: a Radix Select inside the Sheet set body pointer-events:none,
  # making its own trigger inert so the close-tap fell through to the Dialog
  # overlay and reopened the Select. SheetContent now stays pointer-events:auto.

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents

  Scenario: Clicking the open category dropdown closes it (no reopen)
    When I open the settings tab for "My E2E Budget"
    And I open the add recurring rule form
    And I open the recurring category dropdown
    And I click the recurring category dropdown again
    Then the recurring category dropdown is closed
