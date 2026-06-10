@phase8
Feature: Share link — generate in Settings and recipient join flow

  Background:
    Given I am signed in as a fresh user

  Scenario: Share link can be generated in Settings
    When I open the settings tab for "My E2E Budget"
    And I generate an invite link
    Then the share URL field is visible and contains a URL

  Scenario: Recipient following the link sees the join card
    When I open the settings tab for "My E2E Budget"
    And I generate an invite link
    And I copy the invite token from the share URL field
    And I visit the join page with the copied token
    Then the join card is visible

  Scenario: Revoked or invalid link shows an error state
    When I visit the join page with token "invalid-token-abc123"
    Then the join error heading is visible
