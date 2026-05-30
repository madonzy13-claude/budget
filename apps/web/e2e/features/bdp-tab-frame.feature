Feature: BDP tab frame
  # Covers BDP-01 (sticky pills), BDP-02 (tab order + default Wallets per
  # UAT-PH5-T2-02), BDP-04 (active yellow), BDP-05 (back/forward), and mobile
  # pill collapse (MAJOR #21).

  Background:
    Given I am signed in as a fresh user

  Scenario: Visiting /budgets/[id] redirects to /wallets
    When I open the BDP for "My E2E Budget"
    Then the URL ends with "/wallets"

  Scenario: Clicking a pill navigates to its tab route
    When I open the BDP for "My E2E Budget"
    And I click the "Reserves" tab pill
    Then the URL ends with "/reserves"
    And the "Reserves" tab pill has the active state

  Scenario: Browser back restores the previous tab
    When I open the BDP for "My E2E Budget"
    And I click the "Spendings" tab pill
    And I press the browser Back button
    Then the URL ends with "/wallets"
    And the "Wallets" tab pill has the active state

  Scenario: Deep-link to /spendings paints Spendings as active on first render
    When I open the BDP spendings tab for "My E2E Budget"
    Then the "Spendings" tab pill has the active state on first paint

  Scenario: Mobile viewport collapses inactive pill labels to icon-only (MAJOR #21)
    Given I am on a phone-sized viewport
    When I open the BDP for "My E2E Budget"
    Then the "Wallets" tab pill has the active state
    And the inactive pill "Spendings" hides its label
    And the inactive pill "Reserves" hides its label
    And the inactive pill "Settings" hides its label

  # Bug: pulling down at the top of Wallets/Reserves rubber-banded the main
  # scroll surface, stretching the sticky BDP pills bar. Spendings + Settings
  # were unaffected (Spendings has an inner scroll container with
  # overscroll-behavior:contain; Settings doesn't overflow). Fix anchors the
  # contract on the shared <main>: it must never bounce.
  Scenario: Wallets tab anchors the sticky pills bar by disabling iOS rubber-band on main
    When I open the BDP wallets tab for "My E2E Budget"
    Then the app main scroll surface has overscroll-behavior-y "none"

  Scenario: Reserves tab anchors the sticky pills bar by disabling iOS rubber-band on main
    When I open the BDP for "My E2E Budget"
    And I click the "Reserves" tab pill
    Then the app main scroll surface has overscroll-behavior-y "none"
