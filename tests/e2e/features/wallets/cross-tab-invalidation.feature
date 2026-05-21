@phase5
Feature: Wallets — edit reserve wallet amount → Reserves tab totals update (D-PH5-E1)

  Scenario: Editing a RESERVE wallet's amount changes the totals row on the Reserves tab
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "100.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "500.00"
    When I open the Reserves tab on a budget "Family"
    Then the "Σ reserve wallets" total shows "500 EUR"
    When I open the Wallets tab on a budget "Family"
    And I edit the wallet "Vault" amount to "1000.00"
    And I open the Reserves tab on a budget "Family"
    Then the "Σ reserve wallets" total shows "1,000 EUR"
