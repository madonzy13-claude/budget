@phase2
Feature: Edit transaction via correction row

  Background:
    Given I am signed in as a fresh user with workspace "Edit Test Workspace"
    And I have a checking account "Main" with currency "EUR"

  Scenario: User edits an expense; original is preserved; history panel shows both versions
    Given I have an expense "Coffee" of 5 EUR on 2026-05-08
    When I open the Transactions page
    Then I see a transaction in the list with amount "5"
    When I open the transaction edit form for "Coffee"
    And I change the amount to "7"
    And I save the edit
    Then I see a transaction in the list with amount "7"
    And the transaction shows an "edited" badge
    When I click the "edited" badge for the transaction
    Then the edit history panel shows 2 rows
    And the first history row has amount "5"
    And the second history row has amount "7"
