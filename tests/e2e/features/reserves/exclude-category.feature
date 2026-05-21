@phase5
Feature: Reserves — drag category to Excluded hides it from totals (D-PH5-R10)

  Scenario: Excluding a category removes it from totals; restoring brings the balance back
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the budget "Family" has a category "Food" with planned "0.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "1000.00"
    And the category "Housing" reserve adjustment is "+30000" cents
    And the category "Food" reserve adjustment is "+70000" cents
    When I open the Reserves tab on a budget "Family"
    Then the "Σ category reserves" total shows "1,000 EUR"
    When I drag the category "Housing" to the Excluded section
    Then the Active section does not contain "Housing"
    And the Excluded section contains "Housing"
    And the "Σ category reserves" total shows "700 EUR"
    When I drag the category "Housing" to the Active section
    Then the Active section contains "Housing"
    And the row for "Housing" shows reserve balance "300"
