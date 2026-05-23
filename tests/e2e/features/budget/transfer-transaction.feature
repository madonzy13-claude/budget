@phase2
Feature: Capture a TRANSFER between two accounts

  Plan 02-06 EXPN-04: TRANSFER kind creates two linked ledger rows sharing
  `transfer_group_id`. Both source + destination account balances update.

  Scenario: User transfers funds from checking to savings
    Given I am signed in as a fresh user with workspace "Family"
    And I have a checking account "Main" with currency "EUR"
    And I have a checking account "Savings" with currency "EUR"
    When I open the Transactions page
    And I click "Add transaction"
    And I fill the transfer form from "Main" to "Savings" amount "100.00" currency "EUR" date "2026-05-08"
    And I save the transaction
    Then I see a transaction in the list with amount "100"
