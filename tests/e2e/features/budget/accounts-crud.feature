@phase2
Feature: Account CRUD

  Scenario: User creates and archives an account
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Accounts page
    And I click "Add account"
    And I fill the account form with name "Cash Wallet", kind "CASH", scope "PERSONAL", currency "USD"
    And I save the account
    Then I see "Cash Wallet" in the Accounts list under "Assets"
    When I archive "Cash Wallet"
    Then "Cash Wallet" no longer appears in the active list
