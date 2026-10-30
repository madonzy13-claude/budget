@investments @investments-history
Feature: Investments — the entries ledger and newest-only undo (13.1)
  Entries are an append-only ledger under each asset. The only edit is
  deleting the newest entry, which fully undoes it (D-14).

  Background:
    Given I am signed in as a fresh user
    And investments are enabled for my budget

  Scenario: Deleting a sale undoes it
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    And I delete the newest entry of "IBKR"
    Then the holding row "IBKR" shows "96,000"
    And the holding row "IBKR" shows "74.5%"

  Scenario: Deleting a conversion undoes both sides
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    And a "cash" holding "Cash" deposited 1000000 cents worth 1000000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" into "Cash" receiving "66000"
    And I delete the newest entry of "IBKR"
    Then the holding row "IBKR" shows "96,000"
    And the holding row "Cash" shows "10,000"

  Scenario: Delete then re-enter does not double count
    Given a "broker" holding "IBKR" deposited 5500000 cents worth 9600000 cents exists in my budget
    When I open the investments wallets tab
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    And I delete the newest entry of "IBKR"
    And I sell "IBKR" leaving "30000" out of investments receiving "66000"
    Then the holding row "IBKR" shows "30,000"
    And the "broker" type shows realized "+28,188"

  # D-06/D-07: backfill real history by date.
  Scenario: Adding a holding with a past date records it on that date
    When I open the investments wallets tab
    And I add a broker "BOSSA - IKE" deposited "55000" worth "96000" opened on "2023-05-01"
    Then the ledger of "BOSSA - IKE" lists "May 1"
