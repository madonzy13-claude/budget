@phase5
Feature: Wallets — add, edit, drag, delete (WALT-01..07)

  Scenario: User adds a Spendings wallet, edits its name, drags it to Cushion, deletes it
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Wallets tab on a budget "Family"
    And I click "Add spendings wallet"
    And I edit the wallet "New wallet" name to "Cash"
    Then the "SPENDINGS" wallets section contains "Cash"
    When I edit the wallet "Cash" amount to "250.00"
    # centsToBare drops trailing .00 by design (UAT-PH5-T3-29) — "250.00"
    # input is accepted and re-displayed as "250".
    Then the wallet "Cash" amount is "250"
    When I drag the wallet "Cash" to the "CUSHION" section
    Then the "CUSHION" wallets section contains "Cash"
    And the "SPENDINGS" wallets section does not contain "Cash"
    When I delete the wallet "Cash" and confirm
    Then the wallet "Cash" is not present in any section
