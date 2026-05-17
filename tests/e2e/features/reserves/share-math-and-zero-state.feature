@phase5
Feature: Reserves — share math + em-dash zero state (RSRV-06, D-PH5-R4)

  Scenario: Two categories with reserves and one reserve wallet show correct shares
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the budget "Family" has a category "Food" with planned "0.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "1000.00"
    And the category "Housing" reserve adjustment is "+30000" cents
    And the category "Food" reserve adjustment is "+70000" cents
    When I open the Reserves tab on a budget "Family"
    Then the row for "Housing" shows wallet share "EUR 300.00 (30.00%)"
    And the row for "Food" shows wallet share "EUR 700.00 (70.00%)"

  Scenario: With no reserve wallets the share column is em-dash
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the category "Housing" reserve adjustment is "+50000" cents
    When I open the Reserves tab on a budget "Family"
    Then the row for "Housing" shows wallet share "—"
