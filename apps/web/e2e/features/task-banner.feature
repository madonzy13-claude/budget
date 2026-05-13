Feature: Task banner shell
  # Covers BDP-03 (banner visibility + count chip + expand) and mobile-viewport rendering.

  Background:
    Given I am signed in as a fresh user

  Scenario: Banner is absent from DOM when no pending tasks
    When I open the BDP for "My E2E Budget"
    Then the task banner is not present in the DOM

  Scenario: Banner renders with count chip when pending tasks exist
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget"
    When I open the BDP for "My E2E Budget"
    Then the task banner displays "1 task pending"

  Scenario: Clicking the banner expands the task list
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget"
    When I open the BDP for "My E2E Budget"
    And I click the task banner
    Then the task banner is expanded
    And the expanded list shows 1 task row
    And the task row's primary action button is disabled

  Scenario: Banner renders correctly on a phone-sized viewport
    Given I am on a phone-sized viewport
    And a "RESERVE_TOPUP" task is seeded for "My E2E Budget"
    When I open the BDP for "My E2E Budget"
    Then the task banner displays "1 task pending"
