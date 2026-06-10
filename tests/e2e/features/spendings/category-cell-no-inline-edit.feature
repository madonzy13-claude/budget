@phase4
Feature: Spendings column header — double-click only enters inline-edit on the
         planned-value cell (D-PH4-INT4 regression guard)

  Background:
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"

  Scenario: Double-click on the category-name cell does NOT enter inline-edit
    When I open the Spendings tab on a budget "Family"
    And I double-click the category-name cell for column "Groceries"
    Then I do not see the inline-edit input on column "Groceries" name cell

  @skip-phase-05-debt
  # TODO(phase-05-debt): the planned-value cell does not yet expose an
  # inline-edit input in the v1.1 ColumnHeader (D-PH4-INT4 currently
  # preventDefaults double-click on every header cell). Re-enable once
  # the affordance ships with a stable testid.
  Scenario: Double-click on the planned-value cell DOES enter inline-edit
    When I open the Spendings tab on a budget "Family"
    And I double-click the planned-value cell for column "Groceries"
    Then I see the inline-edit input on column "Groceries" planned cell
