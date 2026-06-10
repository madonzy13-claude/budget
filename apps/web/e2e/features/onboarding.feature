@phase8
Feature: Onboarding wizard — end-to-end including skippable push opt-in step

  Background:
    Given I am signed in as a new user with no existing budget

  Scenario: New user completes the onboarding wizard
    When I open the onboarding wizard
    Then the wizard stepper is visible
    When I advance through the wizard basics step with name "My Family Budget"
    And I advance past the optional wizard steps
    Then the push opt-in switch is present on the push step
    When I complete the wizard
    Then I land on the new budget spendings page

  Scenario: Onboarding push step can be skipped
    When I open the onboarding wizard
    And I advance through the wizard basics step with name "Skip Test Budget"
    And I advance past the optional wizard steps to the push step
    And I skip the push step
    When I complete the wizard
    Then I land on the new budget spendings page
