@investments-sell
Feature: Investments — sell, convert, withdraw (Phase 13)
  Selling moves money without distorting contributions or erasing gains:
  realized gain stays with the source type, every sale has a destination.

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  # D-20: a deposit can be sold in part; all interest so far is realized and
  # the remainder restarts from the sale date.
  Scenario: Selling part of a deposit books its interest and restarts the rest
    Given I am on a phone-sized viewport
    And a deposit "Lokata" of 1000000 cents at 5% yearly started a year ago exists in my budget
    When I open the investments wallets tab
    And I sell "Lokata" leaving "6500" out of investments receiving "4000"
    Then the deposit "Lokata" restarts today with principal 650000 cents
    And the "deposit" type shows realized "+500"
