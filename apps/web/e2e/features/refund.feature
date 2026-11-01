@r6-refund
Feature: Refunds give money back to a spending category
  # User (round 6): a refund is entered as a negative amount in quick add, or
  # chosen explicitly in Edit; it shows a refund mark and lowers what was spent.

  Background:
    Given I am signed in as a fresh user

  Scenario: A negative quick add is a refund
    Given the budget has a category "Food" with a limit of 1000
    And "Food" has 250 of spending this month
    When I open the spendings tab for the budget
    And I quick-add "-25" in "Food"
    Then the refund of 2500 cents shows a refund mark
    When I reveal the spent total on the "Food" usage chip
    Then the "Food" usage chip reads "225"
    And editing the refund of 2500 cents shows Refund with 25
