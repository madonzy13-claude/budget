@phase5
Feature: Wallets — drag non-budget-currency wallet to Reserve rejected (D-PH5-W8)

  Scenario: A USD wallet dropped into the Reserve section on a EUR budget snaps back with a toast
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a wallet "Pocket" of type "SPENDINGS" with currency "USD" and amount "10.00"
    When I open the Wallets tab on a budget "Family"
    And I drag the wallet "Pocket" to the "RESERVE" section
    Then the "SPENDINGS" wallets section contains "Pocket"
    And the "RESERVE" wallets section does not contain "Pocket"
    And I see a toast "Reserve wallets must be in EUR"
