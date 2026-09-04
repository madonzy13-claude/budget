@investment-category
Feature: Smart Investments category
  # r33: a special, non-deletable "Investments" spendings category pinned first
  # that tracks how much the family actually invests. Its limit is MANUAL or
  # SMART (= monthly income − Σ planned of every other category). Smart needs an
  # income; overspend reads "overinvested" in green; it is excluded from reserves.

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  Scenario: The Investments category is pinned first with a green overinvested row
    Given the budget has the Investments category enabled
    When I open the spendings tab for the budget
    Then the first spendings column is the Investments category
    And the Investments column shows an overinvested row

  Scenario: Smart limit is disabled without an income
    Given the budget has the Investments category enabled
    When I open the spendings tab for the budget
    And I open the Investments category editor
    Then the smart limit option is disabled
    And the smart-limit income hint is shown

  Scenario: Smart limit equals income minus every other category's planned
    Given the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a monthly income of 200000 cents
    And the budget has the Investments category enabled
    When I open the spendings tab for the budget
    Then the Investments column planned equals 150000 cents

  # In a cushion month the Investments limit is always the category's scheduled
  # payments and nothing else, so the editor SAYS so — and changes nothing else
  # (user, 260904f). The limit being ignored this month is no reason to stop
  # someone setting the one every other month will use.
  Scenario: A cushion month explains that the limit is the scheduled payments
    Given the budget has a monthly income of 200000 cents
    And the budget has the Investments category enabled
    And the budget is in cushion mode
    When I open the spendings tab for the budget
    And I open the Investments category editor
    Then the cushion-limit note is shown
    And every limit mode is still selectable

  Scenario: An ordinary month says nothing about cushion
    Given the budget has a monthly income of 200000 cents
    And the budget has the Investments category enabled
    When I open the spendings tab for the budget
    And I open the Investments category editor
    Then no cushion-limit note is shown
