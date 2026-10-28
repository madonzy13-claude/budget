@investments @investments-assets
Feature: Investments as assets with transactions (13.1)
  An asset is a named group of entries within a type: buying under the same
  name joins it (DCA), Swap buys / sells / transfers, a sale can land in a
  wallet, and the ledger underneath only lets the newest entry go.

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  # D-01/D-02: DCA — the same name joins the asset.
  Scenario: Buying under the same name twice makes one asset with two entries
    When I open the investments wallets tab
    And I add a "collectibles" asset "Coins" of "1" units bought at "100" now "120"
    And I add a "collectibles" asset "Coins" of "2" units bought at "110" now "120"
    Then there is exactly one asset row "Coins"
    And the ledger of "Coins" has 2 entries

  # UAT 13.1 test 7: tracked types autocomplete from the type's own assets —
  # the list is there on focus, and picking one buys into it.
  Scenario: Adding a crypto asset offers its existing name before typing
    Given a "crypto" asset "BTC Ledger" of "1" units at 5000000 cents exists in my budget
    When I open the investments wallets tab
    And I add "0.5" at "60000" to the existing "crypto" asset "BTC Ledger" from the Add form
    Then there is exactly one asset row "BTC Ledger"
    And the ledger of "BTC Ledger" has 2 entries

  # D-02/D-17: a sold-out asset is offered as Closed and buying revives it.
  Scenario: The autocomplete offers a hidden asset and buying revives it
    Given a hidden "collectibles" asset "Old coin" exists in my budget
    When I open the investments wallets tab
    Then the holding row "Old coin" is gone
    When I add "old" to the hidden "collectibles" asset "Old coin" of "1" units bought at "50" now "60"
    Then the holding row "Old coin" is visible

  # D-08: broker add books the deposit and refreshes the value.
  Scenario: A broker top-up books the deposit and the account value after
    Given a "broker" holding "IBKR" deposited 10000000 cents worth 12000000 cents exists in my budget
    When I open the investments wallets tab
    And I buy into broker "IBKR" adding "10000" with the account now at "133250"
    Then the holding row "IBKR" shows "133,250"

  # D-20/D-21: Out of investments into an existing wallet, by delta.
  Scenario: Selling into an existing wallet raises its balance
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "SPENDINGS" wallet "Bank" with 10000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" into the wallet "Bank" receiving "66000"
    Then the wallet "Bank" holds 6610000 cents
    And the "broker" type shows realized "+28,187.5"

  # D-23: a new wallet starts with the amount.
  Scenario: Selling into a new wallet creates it with the amount
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "0" into a new "CUSHION" wallet "From IBKR" receiving "96000"
    Then the wallet "From IBKR" holds 9600000 cents
    And the holding row "IBKR" is gone

  # D-10: Transfer is not a sale.
  Scenario: Moving everything to a new label hides the source
    Given a "collectibles" asset "Coins" of "4" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I move all of "Coins" to a new asset "Vault"
    Then the holding row "Vault" is visible
    And the holding row "Coins" is gone

  # D-14/D-21: only the newest entry; deleting a wallet sale takes the money back.
  Scenario: Only the newest entry can be deleted; deleting the wallet sale takes the money back
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "SPENDINGS" wallet "Bank" with 10000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" into the wallet "Bank" receiving "66000"
    And I tap the oldest entry of "IBKR"
    Then the ledger says "Only the latest entry can be deleted."
    When I delete the newest entry of "IBKR"
    Then the wallet "Bank" holds 10000 cents
    And the holding row "IBKR" shows "96,000"

  # D-16: a linked leg waits for the later entries in the other asset.
  Scenario: A sale into another asset cannot be deleted while that asset has a later entry
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Cash" deposited 1000000 cents worth 1000000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" into "Cash" receiving "66000"
    And I buy into "Cash" adding "100"
    And I tap the newest entry of "IBKR"
    Then the ledger says "Remove the later entries in Cash first."

  # D-07: a taken label is refused.
  Scenario: Renaming onto a label already used in the type is refused
    Given a "collectibles" asset "Coins" of "1" units at 2500 cents exists in my budget
    And a "collectibles" asset "Stamps" of "1" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I rename "Stamps" to " coins "
    Then the edit says "This type already has an asset with that name." and cannot be saved

  # D-26 (Phase 13 UAT test 2): value only until tapped.
  Scenario: The type header shows its value until tapped
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header shows only its value
    And tapping the "broker" header shows the P/L sum-up

  # UI-SPEC: the Swap sheet fits a phone in every launch locale.
  Scenario Outline: The Swap sheet fits a phone in <locale>
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "SPENDINGS" wallet "Bank" with 10000 cents exists in my budget
    When I open the investments wallets tab in "<locale>"
    And I open the sale of "IBKR" into an existing wallet
    Then the Swap sheet fits the phone without overflow

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |

  # Live phone drive (13.1-16): list → ledger strip look in both themes →
  # every Swap tab shows its sum-up and fits, in every launch locale.
  Scenario Outline: Asset list, ledger and every Swap tab on a phone in <locale>
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab in "<locale>"
    Then the ledger of "IBKR" sits on the sunken surface with an inset top shadow in both themes
    And every Swap tab of "IBKR" shows the sum-up card and fits the phone

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |
