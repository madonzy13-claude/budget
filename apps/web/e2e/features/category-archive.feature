@tasks-redesign
Feature: Category archive — keep-history revert, permanent delete, action reveal

  # 260611-vuo follow-up coverage:
  #   1. Archive (keep history) → revert via Undo icon (no confirm) restores the
  #      column with limits unchanged in the same month.
  #   2. Archived column trash → confirm dialog → column removed (regression
  #      guard for the dead-trash bug).
  #   3. Clicking a non-name header row cell (planned) reveals the action
  #      cluster: pen on a normal column, revert + trash on an archived one.
  #   4. Normal column shows no archived label and the full untruncated name.
  #
  # An archived "keep history" category only stays visible in months where it
  # has at least one transaction — the seeded confirmed spend keeps the column
  # on screen for the same-month archive flows.

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents

  Scenario: Reverting an archived category restores it unchanged in the same month
    Given the budget has a confirmed spend of 700 cents in "Groceries"
    When I open the BDP spendings tab for "My E2E Budget"
    Then the "Groceries" column shows a planned amount of "500"
    When I archive the "Groceries" category keeping history
    Then the "Groceries" column shows the archived label
    When I click the revert icon on the "Groceries" column
    Then the "Groceries" column does not show the archived label
    And the edit pen is available on the "Groceries" column
    And the "Groceries" column shows a planned amount of "500"

  Scenario: Trash on an archived column opens the confirm dialog and deletes the column
    Given the budget has a confirmed spend of 700 cents in "Groceries"
    When I open the BDP spendings tab for "My E2E Budget"
    And I archive the "Groceries" category keeping history
    Then the "Groceries" column shows the archived label
    When I click the trash icon on the "Groceries" column
    Then the category permanent-delete confirm dialog is visible
    When I confirm the permanent category delete
    Then the "Groceries" column is removed from the grid

  Scenario: Clicking a budget row cell reveals the column actions
    Given the budget has a confirmed spend of 700 cents in "Groceries"
    When I open the BDP spendings tab for "My E2E Budget"
    Then the edit pen on the "Groceries" column is concealed
    When I click the planned row cell on the "Groceries" column
    Then the edit pen on the "Groceries" column is revealed
    When I archive the "Groceries" category keeping history
    Then the "Groceries" column shows the archived label
    When I click the planned row cell on the "Groceries" column
    Then the revert icon on the "Groceries" column is revealed
    And the trash icon on the "Groceries" column is revealed

  Scenario: A normal category header shows no archived label and the full name
    When I open the BDP spendings tab for "My E2E Budget"
    Then the "Groceries" column does not show the archived label
    And the "Groceries" column shows its full name without truncation
