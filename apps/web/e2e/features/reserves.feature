@tasks-redesign
Feature: Reserves tab — single reserve + used per category + surplus banner

  The Phase 05 reserve rewrite (05-REWRITE-SPEC.md) reshapes the Reserves tab to
  the engine model: each active category shows ONE editable Reserve value plus a
  read-only Used value, and a budget-level surplus banner tells the family to top
  up or withdraw (or that reserves are reconciled). The old Expected/Actual/Share
  columns and the MismatchChip are gone. These scenarios drive the rebuilt web
  image end-to-end.

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents
    And the budget has a RESERVE wallet "Buffer" holding 10000 cents

  Scenario: Reserves tab shows the Reserve and Used columns per category (no Share)
    When I open the reserves tab for the budget
    Then the reserve cell for "Groceries" is visible
    And the used cell for "Groceries" is visible
    And the reserves tab has no "Share" column

  Scenario: Reserves tab shows the surplus banner sourced from the engine totals
    When I open the reserves tab for the budget
    Then the surplus banner is visible
    # internal=0 (no reserve set yet) < userDefined=10000 → WITHDRAW the excess.
    And the surplus banner shows the "WITHDRAW" direction

  Scenario: Adjusting a category reserve updates the reserve value and the surplus banner
    When I open the reserves tab for the budget
    And I set the reserve for "Groceries" to "300"
    Then the reserve cell for "Groceries" shows "300"
    # internal=30000 now exceeds userDefined=10000 → TOPUP the reserve wallet.
    And the surplus banner shows the "TOPUP" direction

  Scenario: Disabling reserves shows the disabled notice
    Given reserves are disabled for the budget
    When I open the reserves tab for the budget
    Then the reserves disabled notice is visible
