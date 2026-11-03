@tasks-redesign @reserves-multi-currency
Feature: The reserves tab in several currencies
  # Phase 14 (D-10/D-14): each category's reserve is held in its own currency;
  # the footer lists what is needed and held per currency.

  Background:
    Given I am signed in as a fresh user
    And the FX rate "EUR" to "USD" on "today" is "1.08"
    And a "EUR" category "Travel" with a 500.00 limit exists in my budget
    And the "Travel" reserve is set to 50.00
    And a "RESERVE" wallet "Dollars" holds 20.00 "USD"

  Scenario: A EUR reserve reads in euros and the footer has a line per currency
    When I open the reserves tab for "My E2E Budget"
    Then the reserves footer line for "EUR" reads "50 / 0 EUR"
    And the reserves footer line for "USD" reads "0 / 20 USD"
