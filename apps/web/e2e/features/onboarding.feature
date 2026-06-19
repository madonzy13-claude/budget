@phase8
Feature: Onboarding wizard — end-to-end with push opt-in folded into Features

  Background:
    Given I am signed in as a new user with no existing budget

  Scenario: New user completes the onboarding wizard
    When I open the onboarding wizard
    Then the wizard stepper is visible
    When I advance through the wizard basics step with name "My Family Budget"
    Then the push opt-in switch is present on the features step
    When I complete the wizard
    Then I land on the new budget spendings page

  Scenario: New user enables push during onboarding and completes
    When I open the onboarding wizard
    And I advance through the wizard basics step with name "Push On Budget"
    And I enable push on the features step
    When I complete the wizard
    Then I land on the new budget spendings page

  Scenario: Wizard does not force a scrollbar on a short step at mobile size
    When I open the onboarding wizard
    Then the wizard stepper is visible
    And the wizard page does not overflow the mobile viewport
