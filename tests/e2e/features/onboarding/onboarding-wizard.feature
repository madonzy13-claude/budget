@phase6
Feature: Onboarding Wizard — 5-step wizard + resume from saved progress (ONBD-*)

  # TODO: Plan 06-08 — implement Page Objects and step bindings for onboarding wizard

  @skip-wip
  Scenario: New user completes the 5-step onboarding wizard
    # TODO: Plan 06-08
    Given I am signed in as a fresh user with no onboarding progress
    When I start the onboarding wizard
    And I complete all 5 steps
    Then my onboarding is marked complete
    And I am redirected to my new budget

  @skip-wip
  Scenario: User resumes onboarding wizard from saved step
    # TODO: Plan 06-08
    Given I am signed in as a user with onboarding progress at step 3
    When I navigate to the onboarding wizard
    Then I see step 3 as the active step
    And steps 1 and 2 are shown as completed

  @skip-wip
  Scenario: Completed onboarding redirects away from wizard
    # TODO: Plan 06-08
    Given I am signed in as a user who has completed onboarding
    When I navigate to the onboarding wizard URL
    Then I am redirected to my budget dashboard
