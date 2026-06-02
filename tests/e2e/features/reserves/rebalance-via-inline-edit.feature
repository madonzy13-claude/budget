@phase5
Feature: Reserves — inline-edit writes the reserve adjustment

  The surplus/shortfall MismatchChip was removed from the totals banner in UAT
  round 7 (the per-pill RESERVE_TOPUP task now surfaces the same signal), so
  this scenario asserts the live effects of the inline edit instead: the row's
  reserve balance and the categories total both reflect the new amount.

  Scenario: Editing a reserve balance writes the adjustment and updates totals
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Housing" with planned "0.00" "EUR"
    And the budget "Family" has a wallet "Vault" of type "RESERVE" with currency "EUR" and amount "1000.00"
    And the category "Housing" reserve adjustment is "+100000" cents
    When I open the Reserves tab on a budget "Family"
    Then the row for "Housing" shows reserve balance "1,000"
    When I edit the reserve balance for "Housing" to "EUR 800.00"
    Then the row for "Housing" shows reserve balance "800"
    And the "categories" total shows "800"
