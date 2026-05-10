@phase2
Feature: Create transaction

  Scenario: User captures a USD expense in an EUR-default workspace
    Given I am signed in as a fresh user with workspace "Family"
    And I have a checking account "Wallet" with currency "EUR"
    When I open the Transactions page
    And I click "Add transaction"
    And I fill the transaction form with kind "EXPENSE", amount "50.00", currency "EUR", date "2024-03-01"
    And I save the transaction
    Then I see a transaction in the list with amount "50.00"
