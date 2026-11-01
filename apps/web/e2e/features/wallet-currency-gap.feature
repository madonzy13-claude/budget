@r6-ccy-gap
Feature: Currency sits close to the amount on a phone
  # User (round 6): the currency is aligned to the widest amount, but the space
  # between them should be about 10px — in every wallet type.

  Background:
    Given I am signed in as a fresh user

  Scenario: Wallets, an investment group and its asset keep a 10px gap
    Given I am on a touch phone
    And investments are enabled for my budget
    And 1 custom holdings exist in my budget
    And a "crypto" holding "Coin" worth 1234567 cents exists in my budget
    And a "SPENDINGS" wallet holds 200.00 USD
    And a "CUSHION" wallet holds 12345.00 USD
    When I open the wallets tab for wallet sections
    Then on a phone every currency sits about 10px from its column's widest amount
    And the open "other" group shows its currency as plain text, not a picker
