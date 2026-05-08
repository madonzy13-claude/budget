Feature: Multi-workspace persistence and active selection
  Phase 1 wires workspace creation + active-workspace storage server-side.
  The switcher UI is a Phase 2 deliverable; these scenarios pin the persistence
  contract that the future UI will read from / write to.

  Scenario: User can create two PRIVATE workspaces in different currencies
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "Alpha"
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page
    When I navigate to "/en/onboarding"
    And I fill workspace name "Beta"
    And I pick the "UAH" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page
    And the active-workspaces endpoint returns 2 workspaces

  Scenario: Active workspace selection persists across reloads
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "Solo"
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page
    And the active-workspaces endpoint returns 1 workspaces
    When I set the active workspaces to all owned workspaces
    And I reload the page
    Then the active-workspaces endpoint returns the same active selection
