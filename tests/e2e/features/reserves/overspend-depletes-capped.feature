@phase7
Feature: Reserves — current-month overspend depletes the reserve

  When a category overspends the OPEN month, its Reserves-tab balance drops by the
  overspend in real time. The engine draws the per-category reserve R, bounded only
  by R itself — NOT by the reserve wallet balance. The Phase-05 golden rewrite made
  userDefined wallets a SURPLUS signal only, never a draw cap (golden row "add
  Grocery txn 500": userDefined 0, yet the reserve still draws used 300). An
  underfunded reserve surfaces as the RESERVE_TOPUP task, not as a smaller depletion.

  So a €200 reserve overspent by €80 shows €120 (200 − 80), regardless of how much
  real reserve cash backs it.

  Scenario: Overspend draws the reserve down by the full overspend
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "100.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "50.00"
    And the category "Groceries" reserve adjustment is "+20000" cents
    When I open the Reserves tab on a budget "Family"
    Then the row for "Groceries" shows reserve balance "200"
    When I open the Spendings tab on a budget "Family"
    And I type "180.00" into the quick-entry input for category "Groceries"
    And I press Enter in the quick-entry input
    And I open the Reserves tab on a budget "Family"
    Then the row for "Groceries" shows reserve balance "120"
