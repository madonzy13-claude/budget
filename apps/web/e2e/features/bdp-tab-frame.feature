Feature: BDP tab frame
  # Covers BDP-01 (sticky pills), BDP-02 (tab order + default Spendings),
  # BDP-04 (active yellow), BDP-05 (back/forward), and mobile pill collapse (MAJOR #21).

  Background:
    Given I am signed in as a fresh user

  Scenario: Visiting /budgets/[id] redirects to /spendings
    When I open the BDP for "My E2E Budget"
    Then the URL ends with "/spendings"

  Scenario: Clicking a pill navigates to its tab route
    When I open the BDP for "My E2E Budget"
    And I click the "Reserves" tab pill
    Then the URL ends with "/reserves"
    And the "Reserves" tab pill has the active state

  Scenario: Browser back restores the previous tab
    When I open the BDP for "My E2E Budget"
    And I click the "Wallets" tab pill
    And I press the browser Back button
    Then the URL ends with "/spendings"
    And the "Spendings" tab pill has the active state

  Scenario: Deep-link to /wallets paints Wallets as active on first render
    When I open the BDP wallets tab for "My E2E Budget"
    Then the "Wallets" tab pill has the active state on first paint

  Scenario: Mobile viewport collapses inactive pill labels to icon-only (MAJOR #21)
    Given I am on a phone-sized viewport
    When I open the BDP for "My E2E Budget"
    Then the "Spendings" tab pill has the active state
    And the inactive pill "Reserves" hides its label
    And the inactive pill "Wallets" hides its label
    And the inactive pill "Settings" hides its label
