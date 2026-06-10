@phase5 @skip-phase-05-debt
# SUPERSEDED by the 05-19 reserves reshape: the per-row "wallet share" column
# (RSRV-06) was removed. The reserves tab now renders a single editable Available
# value per category + three totals (TOTAL AVAILABLE / IN WALLETS / USED) and no
# Share %, so these "share" assertions no longer have a UI to target. Re-enable
# only if a share breakdown is reintroduced. (Not a regression of the reserve
# engine — the golden table carries no per-category share.)
Feature: Reserves — share math + em-dash zero state (RSRV-06, D-PH5-R4)

  Scenario: Two categories with reserves and one reserve wallet show correct shares
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the budget "Family" has a category "Food" with planned "0.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "1000.00"
    And the category "Housing" reserve adjustment is "+30000" cents
    And the category "Food" reserve adjustment is "+70000" cents
    When I open the Reserves tab on a budget "Family"
    Then the row for "Housing" shows wallet share "300"
    And the row for "Housing" shows wallet share "30%"
    And the row for "Food" shows wallet share "700"
    And the row for "Food" shows wallet share "70%"

  Scenario: With no reserve wallets actual and share render as zero
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the category "Housing" reserve adjustment is "+50000" cents
    When I open the Reserves tab on a budget "Family"
    Then the row for "Housing" shows wallet share "0%"
