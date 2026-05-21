@phase4
Feature: Create recurring rule

  Background:
    Given I am signed in as a fresh user with workspace "Recurring"
    And the budget "Recurring" has a category "Rent" with planned "0.00" "USD"

  Scenario: User creates a monthly recurring rule and sees it listed
    When I open the Recurring page
    And I click "Add recurring rule"
    And I fill the recurring rule form with category "Rent", amount "1500.00", currency "USD", cadence "MONTHLY", anchorDay "1", firstDueDate "2026-06-01", note "Rent"
    And I save the recurring rule
    Then I see a recurring rule in the list with amount "1500.00"
    And the recurring rule shows the cadence label "Monthly"
