@phase2
Feature: FX freshness badge surfaces stale-rate transactions
  Per WARNING 6 (moved from Plan 02-06): the search/filter ledger view is the natural home for
  the visual scenario asserting "weekend transaction shows 'rate from Friday' badge".
  D-03-a/b stale-rate UX.

  Background:
    Given I am signed in as a fresh user with workspace "FX Stale Workspace"
    And I have a checking account "Main" with currency "EUR"

  Scenario: Weekend transaction shows the FX freshness badge
    Given I have an expense "Saturday spend" of 100 USD on "2026-05-09"
    When I open the Transactions page
    Then I see a transaction in the list with amount "100"
    And the transaction row shows an FX freshness badge
