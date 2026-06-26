@investments-wallet
Feature: Investments wallet — section, holdings, grouping, optimistic add
  # Plan 09-07 built the UI and un-skipped the viable scenarios. The
  # drag-into-group scenario stays @skip-phase-09-debt: @dnd-kit uses pointer
  # sensors (not HTML5 DnD) and a group header only exists once a holding has
  # that group, so Playwright's dragTo onto a not-yet-existent group header is
  # not reproducible here — DnD reassignment is covered by the human-verify
  # checkpoint instead.

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
    And the holding row "Vintage Watch" persists after a reload

  # INV-11 — drag a holding into a group; assignment persists.
  @skip-phase-09-debt
  Scenario: Drag a holding into a group persists the group assignment
    Given investments are enabled for my budget
    And a custom holding "Gold Bar" worth 500000 cents exists in my budget
    When I open the investments wallets tab
    And I drag the holding "Gold Bar" into group "Precious Metals"
    Then the holding "Gold Bar" is in group "Precious Metals"

  # INV-13 — a group's expanded/collapsed state persists across a reload
  # (localStorage inv-group-<budget>-<slug>); ungrouped rows are always visible.
  Scenario: A group's expanded state persists across a reload
    Given investments are enabled for my budget
    And a custom holding "Apple" worth 198000 cents in group "Brokerage" exists in my budget
    And a custom holding "Vanguard" worth 115000 cents in group "Brokerage" exists in my budget
    And a custom holding "Vintage Car" worth 4500000 cents exists in my budget
    When I open the investments wallets tab
    And I expand the group "Brokerage"
    And I reload the wallets tab
    Then the group "Brokerage" is expanded
    And the holding row "Apple" is visible
    And the holding row "Vintage Car" is visible

  # INV-16 — optimistic create reflects without a reload.
  Scenario: Optimistic create reflects the new holding without a page reload
    Given investments are enabled for my budget
    When I open the investments wallets tab
    And I add a custom holding "Cottage" worth 9000000 cents via the sheet
    Then the holding "Cottage" appears without a page reload
