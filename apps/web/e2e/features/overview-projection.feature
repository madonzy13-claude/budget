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
