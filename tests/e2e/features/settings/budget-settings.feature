@phase6
Feature: Budget Settings — danger zone, cushion toggle, members management (SETT-*)

  # TODO: Plan 06-08 — implement Page Objects and step bindings for settings flows

  @skip-wip
  Scenario: Owner archives a budget from the Danger Zone
    # TODO: Plan 06-08
    Given I am signed in as a budget owner
    When I navigate to Budget Settings
    And I open the Danger Zone section
    And I click Archive Budget
    Then the budget is marked as archived
    And I am redirected to the home page

  @skip-wip
  Scenario: Non-owner cannot see Danger Zone archive/delete controls
    # TODO: Plan 06-08
    Given I am signed in as a budget member (not owner)
    When I navigate to Budget Settings
    Then the Danger Zone section shows read-only view

  @skip-wip
  Scenario: Owner deletes a budget after typing the budget name
    # TODO: Plan 06-08
    Given I am signed in as a budget owner
    When I navigate to Budget Settings
    And I open the Danger Zone section
    And I click Delete Budget and type the budget name correctly
    Then the budget is permanently deleted
