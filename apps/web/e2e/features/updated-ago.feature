@r6-updated-ago
Feature: Every wallet and asset says when its amount last changed
  # User (round 6): a small, faded "updated … ago" under every wallet and
  # asset; an amount that prices itself is a shade dimmer with a ↻ line (G6).

  Background:
    Given I am signed in as a fresh user

  Scenario: Wallets and typed assets show when they changed; a self-priced one is marked automatic
    Given investments are enabled for my budget
    And a "SPENDINGS" wallet holds 200.00 USD
    And a "cash" holding "Pot" deposited 300000 cents worth 300000 cents exists in my budget
    And a deposit "Term deposit" of 500000 cents exists in my budget
    When I open the wallets tab for wallet sections
    Then the wallet "E2E SPENDINGS" says when its balance was updated
    And the asset "Pot" says when it was updated, with no lock
    And the asset "Term deposit" is marked automatic
    And the "cash" group says when it was last updated
    And the "deposit" group total is dimmer than the "cash" group total
