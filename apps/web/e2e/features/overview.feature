@overview
Feature: Budget Overview tab
  # Phase 11 (SC1, SC2): the new "overview" pill is first, uses the same pushState
  # carousel as the other tabs, and renders the five summary cards with no
  # horizontal scroll at 375px. Section + chart scenarios are added in 11-10.

  Background:
    Given I am signed in as a fresh user

  Scenario: Overview is the first pill and shows the five summary cards
    Given I am on a phone-sized viewport
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    Then the URL ends with "/overview"
    And the "Overview" tab pill has the active state
    And the five overview summary cards are visible
    And the page has no horizontal scroll
