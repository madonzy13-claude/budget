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

  # UAT 13.1 test 10: a sale into a quantity asset is quantity × price, and
  # the price never follows the quantity.
  Scenario: Selling into a new crypto asset keeps its price when the quantity changes
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I start selling "IBKR" leaving "0" into a new crypto asset "Moon coin" priced "2"
    Then the destination price stays "2" after typing the quantity "1000"
    When I submit the sale
    Then the holding row "Moon coin" is visible

  # UAT 13.1 test 7: "New transaction" picks Buy / Sell / Transfer first.
  Scenario: New transaction → Transfer moves an asset to a new label
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I transfer all of "IBKR" to a new asset "IBKR 2" from New transaction
    Then the holding row "IBKR 2" is visible
    And the ledger of "IBKR 2" lists "Transfer in"

  Scenario: New transaction → Sell to nowhere books a sale
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" to nowhere from New transaction
    Then the ledger of "IBKR" lists "Sold"

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

  # ── Round 2 (13.1-27..34): one scenario per live-UAT gap ──

  # Gap 1: a deposit younger than its first capitalization still earns.
  @r2-deposit
  Scenario: Opening a young deposit shows the interest earned so far
    Given a deposit "Term" of 1000000 cents at 5% yearly started 3 months ago exists in my budget
    When I open the investments wallets tab
    Then the ledger of "Term" shows an Interest row dated today that cannot be deleted

  # Gaps 2 + 3: the type header is an asset-row card; tap reveals mirror.
  @r2-header
  Scenario: The type header lines up with its asset rows and its tap mirrors the asset row
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header lines up with the asset row "IBKR"
    And tapping the "broker" header grows it and mirrors the asset reveal
    And tapping the asset row "IBKR" shows its share under the amount "96,000"

  # Gaps 4, 11, 12: darker strip with the inset shadow, grey amounts, small links.
  # Seeded straight into the ledger — no Swap step.
  @r2-ledger
  Scenario: The ledger is darker than its asset, casts the inset shadow and keeps amounts grey
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    And "IBKR" moved 100000 cents to "Pot" on its ledger
    When I open the investments wallets tab
    Then the ledger of "IBKR" is darker than its asset and casts the inset top shadow in both themes
    And the linked line in the ledger of "IBKR" is smaller than its date line

  # Gap 5: swiping an open asset slides its ledger along, unclipped.
  @r2-swipe
  Scenario: Swiping an asset with its ledger open keeps the ledger whole
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I swipe the asset "IBKR" with its ledger open
    Then the ledger of "IBKR" moves with its row and nothing is clipped

  # Gap 6: Buy is the default and the switch stays while buying.
  @r2-newtx
  Scenario: New transaction opens on Buy and keeps the switch while buying
    When I open the investments wallets tab
    Then New transaction opens on Buy with the Add form inside and every kind visible
    When I add a "collectibles" asset "Coins" of "1" units bought at "100" now "120"
    Then the holding row "Coins" is visible
    And picking Sell in New transaction asks for the type and drops the Add form

  # Gap 10: Edit shows the configuration it cannot change.
  @r2-edit-locked
  Scenario: Edit shows each asset's configuration locked
    Given a deposit "Term" of 1000000 cents at 5% yearly started 3 months ago exists in my budget
    And a tracked crypto asset "My BTC" on "bitcoin" of "0.5" units at 6000000 cents exists in my budget
    And a silver coin asset "Coins" of 100 grams at 5155 cents with premium "25.17" exists in my budget
    When I open the investments wallets tab
    Then Edit of "Term" shows these locked fields
      | field        | value  |
      | rate         | 5      |
      | capFrequency | Yearly |
      | startDate    | *      |
    And Edit of "My BTC" shows these locked fields
      | field        | value   |
      | instrument   | Bitcoin |
      | currentPrice | *       |
    And Edit of "Coins" shows these locked fields
      | field        | value  |
      | metal        | Silver |
      | kind         | Coin   |
      | uom          | Grams  |
      | currentPrice | *      |
      | premium      | 25.17  |

  # Gap 13: every quantity entry reads "±qty @ price", transfer legs included.
  @r2-qty-price
  Scenario: Every quantity entry shows its quantity at a price
    Given a "stocks" asset "ACME" of "10" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I move "4" of the "stocks" asset "ACME" to a new asset "ACME 2" from New transaction
    Then every quantity entry in the ledger of "ACME" reads quantity at price
    And every quantity entry in the ledger of "ACME 2" reads quantity at price

  # Gaps 8 + 9: Sell asks what was sold; the "everything" buttons only fill.
  @r2-sell
  Scenario: Sell asks how much was sold and Sell everything stays editable
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I open the sale of "IBKR"
    Then the sale asks "How much was sold?"
    When I tap "swap-sell-all" in the sale
    Then "swap-sell-sold" holds "96000" and stays editable
    When I set "Value sold" in the sale to "66000"
    Then "swap-sell-all" is not pressed
    When I send the sale out of investments receiving "66000"
    Then the holding row "IBKR" shows "30,000"

  @r2-sell
  Scenario: Move everything fills the amount and stays editable
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I open the transfer of "IBKR"
    And I tap "swap-transfer-all" in the sale
    Then "swap-transfer-qty" holds "96000" and stays editable
    When I set "Amount moved" in the sale to "1000"
    Then "swap-transfer-all" is not pressed

  # Gap 7: in-DOM pickers with a list of normal height on a phone.
  @r2-picker
  Scenario: Sell pickers open a list of normal height on a phone
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    And a "SPENDINGS" wallet "Bank" with 10000 cents exists in my budget
    And a "SPENDINGS" wallet "Savings" with 20000 cents exists in my budget
    When I open the investments wallets tab
    And I open the sale of "IBKR"
    Then the existing-asset picker opens a full list and picks "Pot"
    And the existing-wallet picker opens a full list and picks "Bank"

  # Live phone drive (13.1-16): list → ledger strip look in both themes →
  # every Swap tab shows its sum-up and fits, in every launch locale.
  Scenario Outline: Asset list, ledger and every Swap tab on a phone in <locale> (<theme>)
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab in "<locale>"
    And I switch to the <theme> theme
    Then the ledger of "IBKR" is darker than its asset and casts the inset top shadow in both themes
    And every Swap tab of "IBKR" shows the sum-up card once filled and fits the phone
    # 13.1 gap closure surfaces (plans 19–24), each checked for overflow + raw keys.
    And assets sit indented under their type header and tapping the "cash" header shows no P/L
    And the ledger of "IBKR" slides open and a swipe on its newest row reveals a delete
    And the New transaction chooser offers Buy, Sell and Transfer and fits the phone
    And the New transaction sheet opens on Buy with the switch visible
    And tapping the "broker" header grows it and shows the share under its value
    And the Sell tab of "IBKR" asks how much was sold
    And a sale of "IBKR" into a new crypto asset keeps its price "2" after typing the quantity "1000"
    And changing the currency of "Pot" to "EUR" in Edit shows the rate line

    Examples:
      | locale | theme |
      | en     | dark  |
      | en     | light |
      | pl     | dark  |
      | pl     | light |
      | uk     | dark  |
      | uk     | light |
