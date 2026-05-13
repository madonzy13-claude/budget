@phase4
Feature: Spendings grid scaffold (placeholder for Phase 4 features)

  Scenario: Spendings tab loads
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Spendings tab on a budget "Family"
    Then I see the spendings grid container
