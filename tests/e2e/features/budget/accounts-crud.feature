@phase2
Feature: Account CRUD

  Scenario: User creates and archives an account
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Wallets page
    And I click "Add wallet"
    And I fill the wallet form with name "Cash Wallet", walletType "CASH", currency "USD"
    And I save the wallet
    Then I see "Cash Wallet" in the Wallets list under "Assets"
    When I archive "Cash Wallet"
    Then "Cash Wallet" no longer appears in the active list
