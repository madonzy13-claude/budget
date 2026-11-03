@tasks-redesign @reserves-multi-currency
Feature: The reserves tab in several currencies
  # Phase 14 (D-10/D-14): each category's reserve is held in its own currency;
  # each total reads as its per-currency parts.

  Background:
    Given I am signed in as a fresh user
    And the FX rate "EUR" to "USD" on "today" is "1.08"
    And a "EUR" category "Travel" with a 500.00 limit exists in my budget
    And the "Travel" reserve is set to 50.00
    And a "RESERVE" wallet "Dollars" holds 20.00 "USD"

  Scenario: The totals read as their per-currency parts
    When I open the reserves tab for "My E2E Budget"
    Then the reserves total needed reads "50 EUR"
    And the reserves total held reads "20 USD"
