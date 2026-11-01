@investments @investments-wallet
Feature: Investments wallet — section, holdings, type groups, optimistic add
  # Since Phase 13 the groups are the investment type (no user-named groups),
  # so there is no drag-into-group; block order and in-type drag are covered
  # with real mouse input below and in @investments-sell.

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

  # Savings holding: manual starting + current amount (no quantity), rides the
  # broker field-set. Exercises the full add→POST→DB CHECK('savings')→persist path.
  Scenario: Add a savings holding persists with its starting and current amounts
    Given investments are enabled for my budget
    When I open the investments wallets tab
    And I add a savings holding "Emergency fund" starting "10000" current "12500" via the sheet
    Then the holding row "Emergency fund" is visible
    And the holding row "Emergency fund" persists after a reload

  # INV-13 (Phase 13): a type block's collapsed state persists across a reload
  # (localStorage inv-type-<budget>-<type>); other blocks stay as they were.
  Scenario: A type block's collapsed state persists across a reload
    Given investments are enabled for my budget
    And a "broker" holding "IBKR" worth 198000 cents exists in my budget
    And a "crypto" holding "Cold wallet" worth 115000 cents exists in my budget
    When I open the investments wallets tab
    And I collapse the "broker" type block
    And I reload the wallets tab
    Then the "broker" type block is collapsed
    And the holding row "IBKR" is hidden
    And the holding row "Cold wallet" is visible

  # INV-16 — optimistic create reflects without a reload.
  Scenario: Optimistic create reflects the new holding without a page reload
    Given investments are enabled for my budget
    When I open the investments wallets tab
    And I add a custom holding "Cottage" worth 9000000 cents via the sheet
    Then the holding "Cottage" appears without a page reload

  # user, 261023: tapping the amount of a hand-priced holding with quantity > 1
  # did nothing. The amount is the TOTAL; it is stored as total ÷ quantity.
  Scenario: Quick-editing a multi-unit holding's total stores the per-unit price
    Given I am on a phone-sized viewport
    And investments are enabled for my budget
    And a custom holding "Land plot" of 3 units at 10000 cents each exists in my budget
    When I open the investments wallets tab
    And I set the amount of holding "Land plot" to "450"
    Then the holding "Land plot" is priced at "15000" cents per unit
    And the holding row "Land plot" shows the amount "450"

  # user, 261023: 170 over 3 units showed 169,98 — the unit price was cut to whole cents.
  Scenario: A total that does not split into whole cents per unit stays as typed
    Given I am on a phone-sized viewport
    And investments are enabled for my budget
    And a custom holding "Land plot" of 3 units at 10000 cents each exists in my budget
    When I open the investments wallets tab
    And I set the amount of holding "Land plot" to "170"
    Then the holding "Land plot" is priced at "5666.666667" cents per unit
    And the holding row "Land plot" shows the amount "170"

  # user, 261023: a block's big total set the amount width for every row, so
  # the rows inside it lost room for their names.
  Scenario: Rows inside a type block size their amounts by the block, not its total
    Given I am on a phone-sized viewport
    And investments are enabled for my budget
    And a "real_estate" holding "Flat A" worth 90000000 cents exists in my budget
    And a "real_estate" holding "Flat B" worth 90000000 cents exists in my budget
    When I open the investments wallets tab
    Then the amounts inside the "real_estate" type block are narrower than its total

  # R6 (user): tapping an amount that can't be typed opens the asset (it used
  # to shake); its lock explains how the amount changes.
  Scenario: Tapping an amount that can't be typed opens the asset; the lock explains
    Given I am on a phone-sized viewport
    And investments are enabled for my budget
    And a deposit "Term deposit" of 500000 cents exists in my budget
    When I open the investments wallets tab
    And I tap the amount of holding "Term deposit"
    Then the asset "Term deposit" opens and nothing shakes
    And tapping the lock of "Term deposit" explains how its amount changes

  # Phase 13 (D-12/D-13): groups are the investment type. Every held type gets a
  # header; blocks drag by their header grip and the order is saved per budget.
  Scenario: Dragging a type block saves the block order across a reload
    Given I am on a phone-sized viewport
    And investments are enabled for my budget
    And a "broker" holding "IBKR" worth 500000 cents exists in my budget
    And a "crypto" holding "Cold wallet" worth 200000 cents exists in my budget
    When I open the investments wallets tab
    Then the type blocks are in order "crypto, broker"
    When I drag the "broker" type block above the "crypto" type block
    Then the type blocks are in order "broker, crypto"
    When I reload the wallets tab
    Then the type blocks are in order "broker, crypto"

