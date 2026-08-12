@tasks-redesign
Feature: Reserves tab — single Available value per category + 2 totals (no banner)

  The Phase 05 reserve rewrite + 05-19 reshape present each active category as ONE
  editable "Available" value (the per-category Used column is removed) and a totals
  strip. That strip carried a third TOTAL USED (THIS MONTH) line until 260810, when
  the totals were renamed to the two figures a household actually compares: TOTAL
  NEEDED (what the plan asks the reserve to hold) and TOTAL HELD (what the reserve
  wallets have), with a direction arrow between them. The old Expected/Actual/Share
  columns, the MismatchChip, the per-row Used cell, and the surplus banner are gone
  — the RESERVE_TOPUP task card is the single reconcile nudge. These scenarios drive
  the rebuilt web image end-to-end.

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a RESERVE wallet "Buffer" holding 10000 cents

  Scenario: Reserves tab shows the Available column and no Used / Share columns
    When I open the reserves tab for the budget
    Then the available cell for "Groceries" is visible
    And the reserves tab has no "Used" column
    And the reserves tab has no "Share" column

  Scenario: Reserves tab shows both totals and no surplus banner
    When I open the reserves tab for the budget
    Then the reserves totals footer is visible
    And the reserves totals footer shows the "Total needed" total
    And the reserves totals footer shows the "Total held" total
    And the reserves tab has no surplus banner

  Scenario: Adjusting a category reserve updates the Available value
    When I open the reserves tab for the budget
    And I set the reserve for "Groceries" to "300"
    Then the available cell for "Groceries" shows "300"
    # internal=30000 now exceeds userDefined=10000; the engine still tracks the
    # surplus, but the UI nudge is the RESERVE_TOPUP task card, not a banner.
    And the reserves totals footer shows the "Total needed" total

  Scenario: Adjusting a reserve that covers this month's overspend warns, then counts down
    # Groceries overspends its 50000c limit by 30000c this month, with no reserve yet.
    Given the budget has a confirmed spend of 80000 cents in "Groceries"
    When I open the reserves tab for the budget
    # Set the reserve to 500; 300 of it is consumed covering the overspend, so the
    # Available lands at 200 — the popup warns and the value counts down to it.
    And I set the reserve for "Groceries" to "500"
    Then the reserve cover popup is visible
    And the reserve cover popup mentions "300"
    When I acknowledge the reserve cover popup
    Then the available cell for "Groceries" shows "200"

  Scenario: Disabling reserves shows the disabled notice
    Given reserves are disabled for the budget
    When I open the reserves tab for the budget
    Then the reserves disabled notice is visible

@phase8
  Scenario: Spending against a reserve-backed category auto-deducts the reserve in real time
    # Seed a reserve so the engine has something to deduct from.
    # The column-header reserves-used indicator appears once any spend is posted
    # against the category (05-REWRITE depletion model: R available drops by the
    # spend amount; no page reload needed — the UI re-renders on mutation).
    Given the budget has a confirmed spend of 2000 cents in "Groceries"
    When I open the spendings tab for the budget
    Then the reserves-used indicator for "Groceries" is visible in the column header
