@phase2
Feature: Account grouping by Assets vs Liabilities

  Plan 02-04 ACCT-01: accounts grouped on the Accounts page by Assets (cash,
  checking, savings, investment) vs Liabilities (credit_card, loan).

  Scenario: Credit card account appears under Liabilities
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Wallets page
    And I click "Add wallet"
    And I fill the wallet form with name "Visa Gold", walletType "CREDIT_CARD", currency "USD"
    And I save the wallet
    Then I see "Visa Gold" in the Wallets list under "Liabilities"

  Scenario: Loan account appears under Liabilities
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Wallets page
    And I click "Add wallet"
    And I fill the wallet form with name "Mortgage", walletType "LOAN", currency "EUR"
    And I save the wallet
    Then I see "Mortgage" in the Wallets list under "Liabilities"
