@phase8
Feature: Share link — generate in Settings and recipient join flow

  Background:
    Given I am signed in as a fresh shared user

  Scenario: Share link can be generated in Settings
    When I navigate to the shared budget settings page
    And I generate an invite link
    Then the share URL field is visible and contains a URL

  Scenario: Recipient following the link sees the join card
    When I navigate to the shared budget settings page
    And I generate an invite link
    And I copy the invite token from the share URL field
    And I visit the join page with the copied token
    Then the join card is visible

  Scenario: Revoked or invalid link shows an error state
    When I visit the join page with token "invalid-token-abc123"
    Then the join error heading is visible

  Scenario: Accepted budget appears in the header switcher without a reload
    When I navigate to the shared budget settings page
    And I generate an invite link
    And I copy the invite token from the share URL field
    And a second fresh user visits the join page with the copied token
    And they accept the invite
    Then the header switcher lists the shared budget
