@phase2
Feature: Category contribution share overrides

  Scenario: User sets share overrides that sum to 100%
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Budget page
    And I create a category "Rent" with scope "SHARED"
    And I open the share override editor for "Rent"
    And I set share for member 1 to "60" and member 2 to "40"
    Then the sum counter shows "Currently 100% — must equal 100%"
    And the save button is enabled
    When I save the shares
    Then I see a success toast

  Scenario: Save is disabled when shares do not sum to 100%
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Budget page
    And I create a category "Utilities" with scope "SHARED"
    And I open the share override editor for "Utilities"
    And I set share for member 1 to "60" and member 2 to "30"
    Then the sum counter shows "Currently 90% — must equal 100%"
    And the save button is disabled
