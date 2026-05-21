@phase4
Feature: Confirm a pending recurring draft mints a ledger transaction

  Background:
    Given I am signed in as a fresh user with workspace "Confirm Draft"
    And the budget "Confirm Draft" has a category "Rent" with planned "0.00" "USD"
    And I have a monthly recurring rule "Rent" of 1500 USD anchored to day 1 in category "Rent"
    And the engine has generated a PENDING draft for "Rent" at 1500 USD

  Scenario: User confirms a pending draft; ledger row appears on the Spendings grid
    When I open the Recurring page
    Then I see a pending draft with amount "1500"
    When I confirm the pending draft
    And I open the Spendings tab on a budget "Confirm Draft"
    Then I see a transaction row "1500" in the "Rent" column
