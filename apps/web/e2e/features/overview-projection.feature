@overview @projection
Feature: Overview cash-flow projection timeline

  Background:
    Given I am signed in as a fresh user

  Scenario: The projection banner renders with a day band
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    Then I see the cash-flow projection banner
    And the projection band has at least 28 day cells

  Scenario: Scrubbing a day shows its tooltip
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I hover the last day of the projection band
    Then I see the projection tooltip
