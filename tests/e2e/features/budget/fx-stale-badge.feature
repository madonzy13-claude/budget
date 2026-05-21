@phase4
Feature: FX freshness badge surfaces stale-rate transactions
  Per WARNING 6 (Plan 02-06 / D-03-a/b): a row sourced from a weekend FX rate carries
  a visible "rate from Friday" indicator so the user can spot non-fresh conversions.

  Scenario: Weekend USD expense in an EUR budget shows the FX freshness badge
    Given I am signed in as a fresh user with workspace "FX Stale"
    And the budget "FX Stale" has a category "Travel" with planned "0.00" "EUR"
    And the budget "FX Stale" has a transaction "100.00" "USD" in category "Travel" on "2026-05-09"
    When I open the Spendings tab on a budget "FX Stale"
    Then I see a transaction row "100.00" in the "Travel" column
    And the transaction row "100.00" shows an FX freshness badge
