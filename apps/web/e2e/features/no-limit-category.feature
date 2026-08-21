@no-limit
Feature: No limit — a category that is deliberately unbounded

  A "No limit" category (mig 0083) records spending like any other, but it can
  never be overspent and it never leaves anything over for the reserve. Both
  figures are structurally zero, so the grid shows a dash rather than "0" —
  which would read as "came in exactly on budget" when there was no budget.

  Background:
    Given I am signed in as a fresh user

  Scenario: An unbounded category shows dashes instead of zeroes
    Given the budget has a category "Gifts" with no limit
    And "Gifts" has 500 of spending this month
    When I open the spendings tab for the budget
    Then the overspent cell for "Gifts" shows a dash
    And the reserves-used cell for "Gifts" shows a dash

  Scenario: A limited category still reports its overspend
    Given the budget has a category "Food" with a limit of 100
    And "Food" has 500 of spending this month
    When I open the spendings tab for the budget
    Then the overspent cell for "Food" is not a dash

  Scenario: The slider offers the toggle and remembers it
    Given the budget has a category "Gifts" with no limit
    When I open the spendings tab for the budget
    And I open the category editor for "Gifts"
    Then the no-limit toggle is checked

  # 4 + 5 (user, 260819): an unbounded category was missing from the Planned
  # charts entirely, and the month-tracking chart drew its whole spend as
  # overspend against a plan of 0. Its plan IS its spend (user, 260820).
  Scenario: An unbounded category still appears in the Planned charts
    Given the budget has a category "House" with no limit
    And "House" has 5000 of spending this month
    When I open the overview planned section for "House"
    Then the planned total reads as unlimited
    And the planned breakdown reports no overspend
