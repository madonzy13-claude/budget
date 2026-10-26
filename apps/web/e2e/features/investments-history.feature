@investments-history
Feature: Investments — edit "What happened?", history and full undo (Phase 13)
  Edits ask what happened so cost never drifts; every entry is dated and can
  be deleted, which fully undoes it.

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  # D-03: Withdrew money books exactly like Sell → Out of investments.
  Scenario: Withdrew money from the edit sheet books like a withdrawal
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I edit "IBKR" to a value of "80000" because I "Withdrew money"
    Then the holding row "IBKR" shows "74.5%"
    And the "broker" type shows realized "+6,833.33"

  Scenario: Added money raises cost, not gain
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I edit "IBKR" to a value of "106000" because I "Added money"
    Then the holding row "IBKR" shows "41,000"
    And the history of "IBKR" lists "Added"

  Scenario: Bought more raises the quantity
    Given a crypto holding "BTC" of "0.4" bought at 2500000 cents now 6000000 cents exists in my budget
    When I open the investments wallets tab
    And I edit "BTC" to a quantity of "0.5" paying "6000"
    Then the holding row "BTC" shows "0.5"
    And the history of "BTC" lists "Bought"

  Scenario: Sold some hands off to the Sell sheet
    Given a crypto holding "BTC" of "0.4" bought at 2500000 cents now 6000000 cents exists in my budget
    When I open the investments wallets tab
    And I edit "BTC" to a quantity of "0.3"
    Then the sale opens with "0.3" left
    When I finish the sale out of investments receiving "6000"
    Then the holding row "BTC" shows "0.3"

  # Roadmap 13.6: a type change is a correction — no booking.
  Scenario: Changing the type is a correction
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I change the type of "IBKR" to "savings"
    Then there is a "savings" type block
    And there is no "broker" type block
    And the "savings" type shows no realized gain
    And the history of "IBKR" lists "Start"

  # D-06/D-07: backfill real history by date.
  Scenario: Adding a holding with a past date records it on that date
    When I open the investments wallets tab
    And I add a broker "BOSSA - IKE" deposited "55000" worth "96000" opened on "2023-05-01"
    Then the history of "BOSSA - IKE" lists "May 1, 2023"

  # D-06: delete = full undo.
  Scenario: Deleting a sale undoes it
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    And I delete the "withdraw" entry of "IBKR"
    Then the holding row "IBKR" shows "96,000"
    And the holding row "IBKR" shows "74.5%"
    And the "broker" type shows no realized gain

  Scenario: Deleting a conversion undoes both sides
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Cash" deposited 1000000 cents worth 1000000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" into "Cash" receiving "66000"
    And I delete the "convert_out" entry of "IBKR"
    Then the holding row "IBKR" shows "96,000"
    And the holding row "Cash" shows "10,000"

  Scenario: Delete then re-enter does not double count
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    And I delete the "withdraw" entry of "IBKR"
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    Then the holding row "IBKR" shows "30,000"
    And the "broker" type shows realized exactly "+28,187.50"

  Scenario: Deleting a holding erases it and its history
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I delete the holding "IBKR"
    And I reload the wallets tab
    Then the holding row "IBKR" is gone

  # UI-SPEC: the new copy fits a phone in every launch locale.
  Scenario Outline: What happened and History fit a phone in <locale>
    Given I am on a phone-sized viewport
    And a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab in "<locale>"
    And I start editing "IBKR" to a value of "80000"
    Then the edit sheet shows What happened and History without overflow

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |

