@reserve-wallet-currency
Feature: Reserve wallets in any currency
  # Phase 14 (D-09, D-14): a reserve wallet may hold any currency, and the
  # reserve section never adds two currencies together as if they were one.

  Background:
    Given I am signed in as a fresh user

  Scenario: Changing a reserve wallet's currency sticks
    Given a "RESERVE" wallet "Buffer" holds 100.00 "USD"
    When I open the wallets tab for wallet sections
    And I change the "RESERVE" wallet "Buffer" currency to "EUR"
    And I reload the wallets tab
    Then the "RESERVE" wallet "Buffer" is in "EUR"

  Scenario: Reserve wallets in two currencies are totalled in the budget currency
    Given the FX rate "EUR" to "USD" on "today" is "1.08"
    And a "RESERVE" wallet "Dollars" holds 100.00 "USD"
    And a "RESERVE" wallet "Euros" holds 100.00 "EUR"
    When I open the wallets tab for wallet sections
    Then the "RESERVE" section total is more than 200 in the budget currency
