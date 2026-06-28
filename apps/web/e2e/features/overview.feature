@overview
Feature: Budget Overview tab
  # Phase 11 (SC1, SC2, SC9): the new "overview" pill is first, uses the same
  # pushState carousel as the other tabs, renders the five summary cards, and
  # exposes four collapsible chart sections (Planned · Overspent · Reserves ·
  # Financial Wealth) with a shared range selector + a wealth view toggle.
  # Strings are localized EN/PL/UK (key parity enforced by overview-keys.test).

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

  Scenario: Each chart section expands to reveal its body
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I expand the "planned" overview section
    Then the "planned" overview section body is visible
    And the planned category selector is visible

  Scenario: Switching the range marks the new preset active
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I select the "3M" overview range
    Then the "3M" overview range is active

  Scenario: Selecting a category re-scopes the Planned section
    Given the budget has a category "Food" with a monthly limit of 50000 cents
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I expand the "planned" overview section
    And I select the category "Food" in the Planned section
    Then the Planned category selector shows "Food"

  Scenario: Wealth toggle to investments reveals the per-type pie region
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I expand the "wealth" overview section
    And I switch the wealth view to "Investments"
    Then the wealth view "Investments" is active
    And the wealth pie region is visible
