@investments @investments-assets
Feature: Investments as assets with transactions (13.1)
  An asset is a named group of entries within a type: buying under the same
  name joins it (DCA), Swap buys / sells / transfers, a sale can land in a
  wallet, and the ledger underneath only lets the newest entry go.

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  # D-01/D-02: DCA — the same name joins the asset.
  # Round-5 scope change: names are not unique — a second Add is a second asset.
  Scenario: Adding under the same name twice makes two assets
    When I open the investments wallets tab
    And I add a "collectibles" asset "Coins" of "1" units bought at "100" now "120"
    And I add a "collectibles" asset "Coins" of "2" units bought at "110" now "120"
    Then there are 2 asset rows "Coins"

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
    And the "broker" type shows realized "+28,188"

  # R6 (user): Buy says where the money came from — another asset sells into it.
  @r6-buy-from-asset
  Scenario: Buying with money taken from another asset
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a crypto holding "BTC" of "0.1" bought at 6099162 cents now 7600000 cents exists in my budget
    When I open the investments wallets tab
    And I buy "0.1" of "BTC" at "300000" with money from "IBKR"
    Then the holding row "IBKR" shows the amount "66,000"

  # D-23: a new wallet starts with the amount.
  Scenario: Selling into a new wallet creates it with the amount
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "0" into a new "CUSHION" wallet "From IBKR" receiving "96000"
    Then the wallet "From IBKR" holds 9600000 cents
    # Round 4 (user): a sold-out asset stays listed (archive is explicit).
    And the holding row "IBKR" shows "0"

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
  Scenario: Moving everything to a new label keeps the emptied source
    Given a "collectibles" asset "Coins" of "4" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I move all of "Coins" to a new asset "Vault"
    Then the holding row "Vault" is visible
    And the holding row "Coins" is visible

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
  # Round-5 scope change: a rename onto another asset's name is fine.
  Scenario: Renaming onto a name already used in the type is saved
    Given a "collectibles" asset "Coins" of "1" units at 2500 cents exists in my budget
    And a "collectibles" asset "Stamps" of "1" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I rename "Stamps" to "Coins"
    Then there are 2 asset rows "Coins"

  # Round-6 gap 7 (user): no chevron — the header row opens / closes its
  # group; stats show while open, value only while closed; open draws a
  # guide line beside its assets.
  @r6-group-header
  Scenario: The type header opens and closes its group; stats follow open
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header shows the P/L sum-up and a guide line beside its assets
    When I collapse the "broker" type block
    Then the "broker" header shows only its value
    And the holding row "IBKR" is hidden

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

  # Round-5 gap 1: a deposit's "Added money" sits on its start date.
  @r5-deposit-start
  Scenario: A deposit's opening entry is dated on its start date
    When I open the investments wallets tab
    And I add a deposit "Term" of "10000" at "5"% started on "2026-03-01"
    Then the ledger of "Term" lists "Mar 1, 2026 · Added money"

  # Round-5 gaps 4 + 5: the held amount names its unit; too much says so.
  @r5-held-unit
  Scenario: Transfer names the unit held and refuses more than that
    Given a tracked crypto asset "My BTC" on "bitcoin" of "1" units at 6000000 cents exists in my budget
    When I open the investments wallets tab
    And I open Swap → Transfer on "My BTC"
    Then the Transfer helper reads "You hold 1 BTC"
    When I type "3" as the Transfer amount
    Then the Swap sheet says "That's more than you hold (1 BTC)."

  # Round-5 gap 3: collapsing a type closes its assets; a reload starts closed.
  @r5-group-close
  Scenario: Collapsing a type closes its assets and a reload starts them closed
    Given a tracked crypto asset "My BTC" on "bitcoin" of "1" units at 6000000 cents exists in my budget
    When I open the investments wallets tab
    And I open the ledger of "My BTC"
    And I collapse the "crypto" type block
    And I collapse the "crypto" type block
    Then the asset "My BTC" is closed
    When I open the ledger of "My BTC"
    And I reload the wallets tab
    Then the asset "My BTC" is closed

  # Round-6 gap 1 (user): collectibles are counted — units × price.
  @r6-collectible-qty
  Scenario: A collectible is sold and moved by units
    When I open the investments wallets tab
    And I add a "collectibles" asset "Vase" of "2" units bought at "500" now "600"
    Then selling "Vase" asks how many units, holding "You hold 2"
    And moving "Vase" asks how many units

  # Round-6 gaps 4 + 6 (user): qty × avg. cost above the price, unrealized ·
  # realized like the header; Edit first, then + (new transaction).
  @r6-row
  Scenario: A tapped asset shows qty × avg. cost and its P/L split; the transaction action sits second
    Given a "stocks" asset "ACME" of "10" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I tap the asset row "ACME"
    Then the asset "ACME" shows "10 × 25 avg. cost" above its price
    And the asset "ACME" caption shows unrealized and realized
    And the asset "ACME" offers Edit first and + second

  # Round 6 (user): changing a metal's currency must save, not say "offline".
  @r6-metal-ccy
  Scenario: A coin's currency can be changed in Edit
    Given a silver coin asset "Coins" of 100 grams at 5155 cents with premium "25.17" exists in my budget
    When I open the investments wallets tab
    And I change the currency of "Coins" to "EUR" in Edit and save
    Then the asset "Coins" is shown in "EUR"

  # R6 (user): the locked price follows each pick at once, before saving.
  @r6-metal-ccy-locked
  Scenario: A coin's locked price follows every currency pick before saving
    Given a silver coin asset "Coins" of 100 grams at 5155 cents with premium "25.17" exists in my budget
    When I open the investments wallets tab
    And I open Edit for "Coins"
    Then the locked price follows the currency through "GBP", "NOK", "GBP" and back

  # Gaps 2 + 3: the type header is an asset-row card; tap reveals mirror.
  @r2-header
  Scenario: The type header lines up with its asset rows and its tap mirrors the asset row
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header lines up with the asset row "IBKR"
    And tapping the "broker" header mirrors the asset reveal
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

  # Gap 13: every entry reads "±qty × price" — transfer legs and one-unit
  # assets included; amount assets (broker, cash, …) keep plain amounts.
  @r2-qty-price
  Scenario: Every quantity entry shows its quantity at a price
    Given a "stocks" asset "ACME" of "10" units at 2500 cents exists in my budget
    And a "collectibles" holding "Diamonds" deposited 300000 cents worth 300000 cents exists in my budget
    When I open the investments wallets tab
    And I move "4" of the "stocks" asset "ACME" to a new asset "ACME 2" from New transaction
    Then every quantity entry in the ledger of "ACME" reads quantity at price
    And every quantity entry in the ledger of "ACME 2" reads quantity at price
    # A one-unit asset (qty 1) books value entries without a quantity.
    And every quantity entry in the ledger of "Diamonds" reads quantity at price

  # Gaps 8 + 9: Sell asks what was sold; the "everything" buttons only fill.
  @r2-sell
  Scenario: Sell asks how much was sold and Sell everything stays editable
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I open the sale of "IBKR"
    Then the sale asks "How much was sold?"
    When I tap "swap-sell-held" in the sale
    Then "swap-sell-sold" holds "96000" and stays editable
    When I set "Value sold" in the sale to "66000"
    When I send the sale out of investments receiving "66000"
    Then the holding row "IBKR" shows "30,000"

  @r2-sell
  Scenario: Move everything fills the amount and stays editable
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I open the transfer of "IBKR"
    And I tap "swap-transfer-held" in the sale
    Then "swap-transfer-qty" holds "96000" and stays editable
    When I set "Amount moved" in the sale to "1000"

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

  # ── Round 3 (13.1-35..38) ──

  # Gaps 2a–2c: normal-weight label, no widening on tap, labelled caption.
  @r3-header
  Scenario: The type header keeps the asset row's weight and size, and labels its caption
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header keeps its size when tapped
    And the "broker" header label has the asset row's weight
    And the "broker" header caption labels unrealized and realized

  # Gap 1: no P/L (cash) = two centred lines; values and shares on one edge.
  @r3-cash-lines
  Scenario: A tapped cash asset is two centred lines lined up with the others
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    Then tapping the asset row "Pot" shows two centred lines without a dash
    And tapping the "cash" header shows its share and no P/L
    And tapping the asset row "IBKR" shows its share under the amount "96,000"
    And tapping the "broker" header shows the share under its value
    And values and shares line up on one right edge

  # Gap 4: zero P/L = grey rise, plus signs.
  @r3-zero-pl
  Scenario: A zero P/L reads as a grey rise with plus signs
    Given a "broker" holding "Flat" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    Then the asset row "Flat" shows a flat P/L
    And the "broker" header shows a flat P/L

  # Gaps 3a + 3b: tall type list; the picked asset's form stays inside.
  @r3-newtx
  Scenario: New transaction keeps type and asset above the Sell and Transfer forms
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the New transaction type list opens a full list
    And picking "IBKR" to sell in New transaction keeps the type and asset above its form
    And picking "IBKR" to transfer in New transaction keeps the type and asset above its form

  # Gap 3c: tap the held amount instead of an "everything" button.
  @r3-held
  Scenario: Tapping the held amount fills Sell and Transfer
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I open the sale of "IBKR"
    Then there is no "swap-sell-all" in the sale
    When I tap "swap-sell-held" in the sale
    Then "swap-sell-sold" holds "96000" and stays editable
    When I switch the Swap sheet to transfer
    And I tap "swap-transfer-held" in the sale
    Then "swap-transfer-qty" holds "96000" and stays editable

  # Gap 9: the ledger delete is square with a shadow on its left.
  @r3-delete
  Scenario: The swiped ledger delete is square with a left shadow
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the revealed delete in the ledger of "IBKR" is square with a left inset shadow

  # ── Round 4 (13.1-40..44) ──

  # Gap 3: Sell ↔ Transfer keeps the type and the asset field.
  @r4-newtx
  Scenario: Switching Sell to Transfer keeps the type and shows the asset field
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    And I start New transaction → Sell on the "broker" type
    Then switching New transaction to Transfer keeps "Broker" and shows the asset field

  # Gap 5: a type with one asset picks it at once.
  @r4-newtx
  Scenario: A type with one asset is picked at once
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I start New transaction → Sell on the "broker" type
    Then New transaction has picked "IBKR" and shows its Sell form

  # Gap 6: the type list has icons like Buy's.
  @r4-newtx
  Scenario: The Sell type list shows type icons
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the New transaction Sell type list shows an icon for "broker"

  # Gap 1: left and right stacks each centred in the card.
  @r4-columns
  Scenario: Header and asset cards centre both columns, closed and tapped
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header and the assets "IBKR" and "Pot" centre both columns, closed and tapped

  # Gap 2: the type icon lives on the header.
  @r4-icon
  Scenario: The type icon is on the header, not on the assets
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the "broker" header carries the type icon and its assets do not

  # Gaps 4 + 7: suggestions say what they are; no "joins" line.
  @r4-suggest
  Scenario: Suggestions show quantity, value and currency
    Given a "stocks" asset "ACME" of "10" units at 2500 cents exists in my budget
    When I open the investments wallets tab
    And I open the Add form on "stocks" and focus the name
    Then the first suggestion shows its value and currency only
    And picking it shows no join note

  # Gap 11: say a field takes an existing asset or a new name.
  @r4-hint
  Scenario: Pick-or-create fields say both work
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    Then the Add form name field shows the pick-or-create hint
    And the transfer "to" field of "IBKR" shows the pick-or-create hint
    And the New transaction asset field shows no pick-or-create hint

  # Gap 8: switching kinds / tabs carries what was filled.
  @r4-carry
  Scenario: Swap tabs carry the amount and the date
    Given a crypto holding "BTC" of "2" bought at 5000000 cents now 6000000 cents exists in my budget
    When I open the investments wallets tab
    And I open the sale of "BTC"
    And I set "Value sold" in the sale to "1"
    And I set the Swap date to yesterday
    Then the Swap tabs carry "1" and yesterday's date through Transfer and Buy

  @r4-carry
  Scenario: New transaction carries type, asset and amount between Sell and Buy
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    Then New transaction carries "IBKR" and "30000" from Sell to Buy and back

  # Round-6 gap 3 (user): one Into investments destination — pick in place
  # (its value shows, no second dropdown) or name a new asset.
  @r4-sell-into @r6-into-investments
  Scenario: Into investments picks an existing asset in place or creates a new one
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" into investments picking "Pot"
    Then the picked destination shows its value and I can save
    And there is exactly one asset named "Pot"

  @r6-into-investments
  Scenario: Into investments with a new name creates that asset
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" into a new investment "Fresh pot"
    Then the holding row "Fresh pot" is visible

  # Gap 10: a linked entry opens its partner.
  @r4-link
  Scenario: Tapping a linked entry opens its partner in the other asset
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    And "IBKR" moved 100000 cents to "Pot" on its ledger
    When I open the investments wallets tab
    Then tapping the linked entry in the ledger of "IBKR" opens "Pot" at the matching entry

  # Gap 26: nothing but the opening entry → Delete (it is gone for good).
  @r4-delete-asset
  Scenario: An asset with no transactions is deleted instead of archived
    Given a "broker" holding "Fresh" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    And I delete the asset "Fresh"
    Then the holding row "Fresh" is gone

  # Gaps 20 + 21: archive is explicit; buying into an archived asset revives it.
  @r4-archive
  Scenario: Archiving hides an asset and buying into it brings it back
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    # A transaction beyond the opening entry, so Archive (not Delete) is offered.
    And I buy into broker "IBKR" adding "1000" with the account now at "97000"
    And I archive the asset "IBKR"
    Then the holding row "IBKR" is gone
    And the "broker" Add form offers "IBKR" as archived and buying "1000" into it brings it back

  # Gap 22: tapped crypto / metal rows stay inside their card.
  @r4-wide
  Scenario: Tapped crypto and metal rows stay inside their card on a phone
    Given I am on a phone-sized viewport
    And a crypto holding "Bitcoin binance" of "2.1" bought at 6099162 cents now 7600000 cents exists in my budget
    And a silver coin asset "Silver coins" of 100000 grams at 5155 cents with premium "25.17" exists in my budget
    When I open the investments wallets tab
    Then tapping the asset row "Bitcoin binance" keeps everything inside its card
    And tapping the asset row "Silver coins" keeps everything inside its card

  # Gap 24: the long Ukrainian caption scrolls instead of widening the row.
  @r4-wide
  Scenario: A tapped crypto row with a long caption stays inside its card in Ukrainian
    Given I am on a phone-sized viewport
    And a crypto holding "BTC - SafePal" of "0.19505480" bought at 6099162 cents now 7600000 cents exists in my budget
    When I open the investments wallets tab in "uk"
    Then tapping the asset row "BTC - SafePal" keeps everything inside its card

  # Round-5 gap 12: a scrolling caption shows its first and last characters.
  @r5-caption-edges
  Scenario: A scrolling caption is sharp at its start and at its end
    # Round 6 dropped cents from big figures: only a small phone still scrolls.
    Given I am on a small phone viewport
    And a crypto holding "BTC - SafePal" of "0.99505480" bought at 6099162 cents now 7600000000 cents exists in my budget
    When I open the investments wallets tab in "uk"
    And I tap the asset row "BTC - SafePal"
    Then its scrolling caption is sharp on the left at the start and on the right at the end

  # Gap 23: the same name in another currency is its own asset (no "(2)").
  @r4-label-ccy
  Scenario: The same name is a separate asset in any currency
    Given a "cash" holding "Erste" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    And I add a "cash" asset "Erste" in "EUR" worth "100"
    And I add a "cash" asset "Erste" in "PLN" worth "200"
    Then there are 3 asset rows "Erste"

  # Round-5 scope change: names are not unique; twins read apart by value.
  @r5-same-name
  Scenario: Same-name assets are offered apart and the picked one shows its value
    Given a "cash" holding "Erste" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    And I add a "cash" asset "Erste" in "PLN" worth "250"
    Then there are 2 asset rows "Erste"
    When I type "Erste" as the name in the "cash" Add form
    Then the name list offers "Add as new asset" and 2 "Erste" options with "1,000" and "250 PLN"
    When I pick the "Erste" option worth "250 PLN"
    Then the picked asset line reads "Asset value: 250 PLN"

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
    And tapping the "broker" header shows the share under its value
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
