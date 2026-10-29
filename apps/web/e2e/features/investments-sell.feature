@investments @investments-sell
Feature: Investments — Swap → Sell (Phase 13 → 13.1)
  Selling moves money without distorting contributions or erasing gains:
  realized gain stays with the source type, every sale has a destination.

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  # D-13: every type with holdings has a header, even with one holding.
  Scenario: Each investment type gets its own header
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a crypto holding "BTC" of "0.4" bought at 2500000 cents now 6000000 cents exists in my budget
    When I open the investments wallets tab
    Then there is a "broker" type block
    And there is a "crypto" type block

  # D-02: realized = received − sold cost, shown on the source type's header.
  Scenario: Selling part of a broker out of investments books realized gain in the header
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    Then the holding row "IBKR" shows "30,000"
    And the holding row "IBKR" shows "74.5%"
    And the "broker" type shows realized "+28,187.5"

  # Roadmap 13.3: realized stays with the source type even when it is gone.
  Scenario: Selling a broker completely into a new cash holding keeps the realized gain
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "0" into a new cash holding "Erste" receiving "96000"
    # Round 4 (user): a sold-out asset stays listed at 0 until archived.
    Then there is a "broker" type block
    And the holding row "IBKR" shows "0"
    And there is a "cash" type block
    # 13.1 UAT 3: no realized line above the list — it stays booked.
    And there is no realized line above the investments
    And the "broker" type still books realized 4100000 cents

  Scenario: Selling into an existing holding tops it up
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Cash" deposited 1000000 cents worth 1000000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" into "Cash" receiving "66000"
    Then the holding row "Cash" shows "76,000"
    And the "broker" type shows realized "+28,187.5"

  Scenario: Selling part of a quantity holding lowers the quantity
    Given a crypto holding "BTC" of "0.4" bought at 2500000 cents now 6000000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "BTC" leaving "0.3" out of investments receiving "6000"
    Then the holding row "BTC" shows "140"
    And the "crypto" type shows realized "+3,500"

  # D-20: a deposit can be sold in part; all interest so far is realized and
  # the remainder restarts from the sale date.
  Scenario: Selling part of a deposit books its interest and restarts the rest
    Given I am on a phone-sized viewport
    And a deposit "Lokata" of 1000000 cents at 5% yearly started a year ago exists in my budget
    When I open the investments wallets tab
    And I sell "Lokata" leaving "6500" out of investments receiving "4000"
    Then the deposit "Lokata" restarts today with principal 650000 cents
    And the "deposit" type shows realized "+500"
    When I reload the wallets tab
    Then the holding row "Lokata" shows "6,500"

  Scenario: Invalid sale input is blocked
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I open the sale of "IBKR"
    And I set "Value sold" in the sale to "96500"
    Then the sale says "Enter more than 0 and no more than you hold."
    And the sale cannot be recorded
    When I set "Value sold" in the sale to "66000"
    And I set "Amount received" in the sale to "0"
    Then the sale says "Enter an amount received greater than 0."
    And the sale cannot be recorded
    And the sale date cannot be after today

  # D-12: block order saved per budget.
  Scenario: Type block order persists
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" worth 500000 cents exists in my budget
    And a "crypto" holding "Cold wallet" worth 200000 cents exists in my budget
    When I open the investments wallets tab
    Then the type blocks are in order "crypto, broker"
    When I drag the "broker" type block above the "crypto" type block
    And I reload the wallets tab
    Then the type blocks are in order "broker, crypto"

  # Round-5 gap 6: any transaction in any currency on any asset.
  @r5-sell-any-ccy
  Scenario: Selling into an existing asset in another currency books into that asset
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Pot" deposited 100000 cents worth 100000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "0" into "Pot" receiving "400" in "EUR"
    Then there is exactly one asset named "Pot"
    And the ledger of "Pot" lists "EUR"
