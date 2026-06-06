@tasks-redesign
Feature: Reserves tab — single Available value per category + 3 totals (no banner)

  The Phase 05 reserve rewrite + 05-19 reshape present each active category as ONE
  editable "Available" value (the per-category Used column is removed) and a totals
  strip with THREE stacked totals: TOTAL AVAILABLE, TOTAL IN WALLETS, and TOTAL USED
  (THIS MONTH). The old Expected/Actual/Share columns, the MismatchChip, the per-row
  Used cell, and the surplus banner are gone — the RESERVE_TOPUP task card is the
  single reconcile nudge. These scenarios drive the rebuilt web image end-to-end.

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a RESERVE wallet "Buffer" holding 10000 cents

  Scenario: Reserves tab shows the Available column and no Used / Share columns
    When I open the reserves tab for the budget
    Then the available cell for "Groceries" is visible
    And the reserves tab has an "Available" column
    And the reserves tab has no "Used" column
    And the reserves tab has no "Share" column

  Scenario: Reserves tab shows the three totals and no surplus banner
    When I open the reserves tab for the budget
    Then the reserves totals footer is visible
    And the reserves totals footer shows the "Total available" total
    And the reserves totals footer shows the "Total in wallets" total
    And the reserves totals footer shows the "Total used (this month)" total
    And the reserves tab has no surplus banner

  Scenario: Adjusting a category reserve updates the Available value
    When I open the reserves tab for the budget
    And I set the reserve for "Groceries" to "300"
    Then the available cell for "Groceries" shows "300"
    # internal=30000 now exceeds userDefined=10000; the engine still tracks the
    # surplus, but the UI nudge is the RESERVE_TOPUP task card, not a banner.
    And the reserves totals footer shows the "Total available" total

  Scenario: Disabling reserves shows the disabled notice
    Given reserves are disabled for the budget
    When I open the reserves tab for the budget
    Then the reserves disabled notice is visible
