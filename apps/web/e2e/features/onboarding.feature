@phase8
Feature: Onboarding wizard — end-to-end

  # Push opt-in was moved out of the wizard into Settings → Notifications
  # (r37 UX). Push coverage lives in the settings/push specs, not here.

  Background:
    Given I am signed in as a new user with no existing budget

  Scenario: New user completes the onboarding wizard
    When I open the onboarding wizard
    Then the wizard stepper is visible
    When I advance through the wizard basics step with name "My Family Budget"
    When I complete the wizard
    Then I land on the new budget spendings page

  Scenario: Wizard does not force a scrollbar on a short step at mobile size
    When I open the onboarding wizard
    Then the wizard stepper is visible
    And the wizard page does not overflow the mobile viewport
