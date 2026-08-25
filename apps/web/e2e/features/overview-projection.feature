@overview @projection
Feature: Overview cash-flow projection timeline

  Background:
    Given I am signed in as a fresh user

  Scenario: The projection banner renders with a day band
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    Then I see the cash-flow projection banner
    And the projection band has at least 28 day cells

  # The strip carries the month names INSIDE it, so a name and the next month's
  # dashed rule share 20px of band. Whether a sliver segment is worth naming is
  # decided in percentages against glyphs that are measured in pixels — a guess
  # that only a real layout engine can mark right or wrong. Runs at 390px too,
  # which is the width where the guess is tightest.
  Scenario: Month names never touch the divider that follows them
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    Then I see the cash-flow projection banner
    And every month name on the projection strip clears its divider

  Scenario: Scrubbing a day shows its tooltip
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I hover the last day of the projection band
    Then I see the projection tooltip

  # An occurrence that has come due and has not been answered is money already
  # committed. It used to reach the tooltip and nothing else, so an UNBOUNDED
  # category — no plan, therefore no daily burn to carry it — left it out of the
  # arithmetic entirely, and the card offered it as withdrawable (user, 260825).
  # 1,000 in the wallet, 400 owed and unanswered → 600 is what can actually go.
  Scenario: Money owed on an unanswered occurrence is not free to move
    Given amounts are shown in full
    And the budget has a SPENDINGS wallet holding 100000 cents
    And the budget has a category "House" with no limit
    And "House" has an unconfirmed occurrence of 40000 cents dated today
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    Then "Free to move" reads 600
