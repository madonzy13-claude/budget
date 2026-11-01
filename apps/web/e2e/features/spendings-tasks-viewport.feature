@r6-tasks-viewport
Feature: Spendings keeps its height after the tasks strip closes
  # User (round 6): on a phone, opening then closing the tasks on Spendings
  # left a black band at the bottom the size of the opened strip.

  Background:
    Given I am signed in as a fresh user

  Scenario: Closing the tasks hands the space back to the grid
    Given I am on a touch phone
    And a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the spendings tab for "My E2E Budget"
    Then opening and closing the spendings tasks gives the grid its height back
