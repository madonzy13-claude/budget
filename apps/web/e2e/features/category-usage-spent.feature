@r6-usage-spent
Feature: A category's percent chip doubles as its spent total
  # User (round 6): tap (phone) or hover (desktop) the percent at the top of a
  # spendings category to see the total spent, rounded; tap again for the
  # percent. A reload starts from the percent.

  Background:
    Given I am signed in as a fresh user

  Scenario: The chip swaps between percent and spent, and a reload resets it
    Given the budget has a category "Food" with a limit of 1000
    And "Food" has 250 of spending this month
    When I open the spendings tab for the budget
    Then the "Food" usage chip reads "25%"
    When I reveal the spent total on the "Food" usage chip
    Then the "Food" usage chip reads "250"
    When I tap the "Food" usage chip
    Then the "Food" usage chip reads "25%"
    When I reveal the spent total on the "Food" usage chip
    And I open the spendings tab for the budget
    Then the "Food" usage chip reads "25%"
