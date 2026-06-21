@investments-wallet @skip-phase-09-debt
Feature: Investments wallet — section, holdings, grouping, optimistic add
  # Wave-0 scaffold (Plan 09-05). Tagged @skip-phase-09-debt so it is excluded
  # from generation/run until Plan 09-07 builds the UI, un-skips it (removes the
  # tag + the `not @skip-phase-09-debt` clause in playwright.config.ts), and
  # implements the InvestmentsPo selectors.

  Background:
    Given I am signed in as a fresh user

  # INV-01 / INV-02 — flag gates the section; it renders last when on.
  Scenario: Flag off hides the section; flag on shows it as the last wallets section
    Given investments are disabled for my budget
    When I open the investments wallets tab
    Then I do not see the investments section
    Given investments are enabled for my budget
    When I open the investments wallets tab
    Then I see the investments section
    And the investments section is the last wallets section

  # INV-06 — add via the Sheet; row appears; the row has no inline input.
  Scenario: Add a custom holding via the Sheet shows a read-only row
    Given investments are enabled for my budget
    When I open the investments wallets tab
    And I add a custom holding "Vintage Watch" worth 250000 cents via the sheet
    Then the holding row "Vintage Watch" is visible
    And the holding row "Vintage Watch" has no inline amount input

  # INV-11 — drag a holding into a group; assignment persists.
  Scenario: Drag a holding into a group persists the group assignment
    Given investments are enabled for my budget
    And a custom holding "Gold Bar" worth 500000 cents exists in my budget
    When I open the investments wallets tab
    And I drag the holding "Gold Bar" into group "Precious Metals"
    Then the holding "Gold Bar" is in group "Precious Metals"

  # INV-16 — optimistic create reflects without a reload.
  Scenario: Optimistic create reflects the new holding without a page reload
    Given investments are enabled for my budget
    When I open the investments wallets tab
    And I add a custom holding "Cottage" worth 9000000 cents via the sheet
    Then the holding "Cottage" appears without a page reload
