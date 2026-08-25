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
    # TWO categories on purpose: the picker treats "all of them ticked" as
    # "everything", so narrowing to the only category there is would still read
    # as "All categories" — and prove nothing.
    Given the budget has a category "Food" with a monthly limit of 50000 cents
    And the budget has a category "Travel" with a monthly limit of 30000 cents
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I expand the "planned" overview section
    And I select the category "Food" in the Planned section
    Then the Planned category selector shows "Food"

  Scenario: Wealth toggle to investments reveals the per-type pie region
    Given the budget has a wealth snapshot of 1000000 cents
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    And I expand the "wealth" overview section
    And I switch the wealth view to "Investments"
    Then the wealth view "Investments" is active
    And the wealth pie region is visible

  # The grid sized its two rows independently, so the Cushion note wrapping to a
  # second line left the row above it visibly shorter (user screenshot, 260825).
  # The cushion surplus is what makes that note two lines on a phone — without it
  # every card holds one line of note and the rows match by accident.
  Scenario: The four summary cards share one height
    Given I am on a 320px-wide viewport
    And the budget has a CUSHION wallet holding 999999900 cents
    When I open the BDP for "My E2E Budget"
    And I click the "Overview" tab pill
    Then the five overview summary cards are visible
    And the four summary cards are all the same height
