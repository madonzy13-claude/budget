@phase5
Feature: Reserves — inline-edit writes adjustment + mismatch chip variant changes

  Scenario: Editing a reserve balance shifts the mismatch chip
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "1000.00"
    And the category "Housing" reserve adjustment is "+100000" cents
    When I open the Reserves tab on a budget "Family"
    Then the mismatch chip is "reconciled"
    When I edit the reserve balance for "Housing" to "EUR 800.00"
    Then the mismatch chip is "overfunded"
    And the mismatch chip amount is "EUR 200.00"
