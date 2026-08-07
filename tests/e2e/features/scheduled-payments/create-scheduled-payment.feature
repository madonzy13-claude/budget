@phase4 @skip-phase-05-debt
Feature: Create scheduled rule

  Background:
    Given I am signed in as a fresh user with workspace "Scheduled"
    And the budget "Scheduled" has a category "Rent" with planned "0.00" "USD"

  Scenario: User creates a monthly scheduled rule and sees it listed
    When I open the Scheduled page
    And I click "Add scheduled rule"
    And I fill the scheduled rule form with category "Rent", amount "1500.00", currency "USD", cadence "MONTHLY", anchorDay "1", firstDueDate "2026-06-01", note "Rent"
    And I save the scheduled rule
    Then I see a scheduled rule in the list with amount "1500.00"
    And the scheduled rule shows the cadence label "Monthly"
