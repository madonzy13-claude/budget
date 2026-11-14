@phase5
Feature: Wallets — a wallet in another currency can be dragged into Reserve
  # Phase 14 (D-09) lifted D-PH5-W8: a reserve wallet may hold any currency,
  # so the drop sticks instead of snapping back.

  Scenario: A USD wallet dropped into the Reserve section on a EUR budget moves there
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a wallet "Pocket" of type "SPENDINGS" with currency "USD" and amount "10.00"
    When I open the Wallets tab on a budget "Family"
    And I drag the wallet "Pocket" to the "RESERVE" section
    Then the "RESERVE" wallets section contains "Pocket"
    And the "SPENDINGS" wallets section does not contain "Pocket"
