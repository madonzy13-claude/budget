@phase8
Feature: Cushion mode — toggle in Settings and reflect in Wallets

  Background:
    Given I am signed in as a fresh user

  Scenario: Cushion mode can be toggled on in Settings
    When I open the settings tab for "My E2E Budget"
    And I open the cushion settings section
    And I set the cushion target months to 3
    Then the cushion target months input shows 3

  Scenario: Wallets tab reflects cushion-mode state
    Given the budget "My E2E Budget" has cushion enabled with target 6 months
    When I open the wallets tab for "My E2E Budget"
    Then the cushion wallet section is visible
