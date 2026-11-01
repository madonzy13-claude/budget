@r6-editable-dots
Feature: A faint dotted line marks what can be tapped and typed
  # User (round 6, I1): no dimming and no "updated … ago" line — a small faint
  # dotted underline marks every name, currency and amount the user can tap
  # and change; what changes by itself carries none.

  Background:
    Given I am signed in as a fresh user

  Scenario: Wallets, typed amounts and currencies are dotted; automatic ones are not
    Given investments are enabled for my budget
    And a "SPENDINGS" wallet holds 200.00 USD
    And a "cash" holding "Pot" deposited 300000 cents worth 300000 cents exists in my budget
    And a deposit "Term deposit" of 500000 cents exists in my budget
    When I open the wallets tab for wallet sections
    Then the wallet "E2E SPENDINGS" and the asset "Pot" carry the dotted line
    And the currency of the asset "Pot" and of the "cash" group carry the dotted line
    And the asset "Term deposit" and the "deposit" group carry no dotted line
    And the asset "Term deposit" explains how its amount changes
    And nothing shows an updated line

  Scenario: On a touch phone the currency dropdown still shows its dots
    Given I am on a touch phone
    And a "SPENDINGS" wallet holds 200.00 USD
    When I open the wallets tab for wallet sections
    Then the wallet "E2E SPENDINGS" currency shows its dots on a phone
