@possessions-wallet
Feature: Possessions wallet — always-on section, add + persist

  # Possessions (house/car/jewelry/…) ride the holdings endpoint as holdingType
  # "possession" but render in their own always-on section after investments.
  # Part of capitalization, excluded from the retirement runway (unit-tested).

  Background:
    Given I am signed in as a fresh user

  # Always on: the section shows with NO investments flag toggled.
  Scenario: The possessions section is always visible on the wallets tab
    When I open the wallets tab for possessions
    Then I see the possessions section

  # Inline staged-add (same as wallets) → row appears → survives a reload (real DB
  # round-trip through the widened holding_type CHECK('possession') + icon/color cols).
  Scenario: Add a possession persists via the inline add row
    When I open the wallets tab for possessions
    And I add a possession "Family car" via the inline add row
    Then the possession row "Family car" is visible
    And the possession row "Family car" persists after a reload
