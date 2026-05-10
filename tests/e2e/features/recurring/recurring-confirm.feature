@phase2
Feature: Confirm a pending recurring draft mints a ledger transaction

  Background:
    Given I am signed in as a fresh user with workspace "Confirm Draft Workspace"
    And I have a checking account "Main" with currency "USD"
    And I have a monthly recurring rule "Rent" of 1500 USD anchored to day 1
    And the engine has generated a PENDING draft for "Rent" at 1500 USD

  Scenario: User confirms a pending draft; ledger row appears
    When I open the Recurring page
    Then I see a pending draft with amount "1500"
    When I confirm the pending draft
    Then I see a transaction in the list with amount "1500"
