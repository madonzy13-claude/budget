@overview-rebalance
Feature: Rebalancing reserves from the Overview
  # 260805: the fit chart says which buffers are the wrong size; the dialog
  # behind the icon in its left corner is where they are put right, without a
  # trip to the Reserves tab. The move is the SAME adjust the Reserves tab
  # posts, so a press here has to reach the reserve ledger for real.
  #
  # The seed makes a buffer that is genuinely SHORT with nothing left overspent:
  # one big overspend early, then quiet months whose unspent limit pays it off.
  # (A category still carrying an overspend never lands on its target, because
  # a positive adjust settles the debt before it builds the buffer.)
  #   −6: +500 → 500 · −5: −2,500 → owes 2,000 · −4…−1: +500 each → owes 0
  #   held 0, and the trough the walk found is 2,000.

  # Travel spends UNDER its limit instead, so what it did not spend accrues and
  # it comes out FAT — a buffer holding more than its history ever asked for.
  # (The engine only walks months that had activity, so a category with no
  # transactions at all accrues nothing.) That gives the dialog one short row and
  # one fat one, with current amounts of very different widths — which is what
  # the alignment and sign scenarios both need.
  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Presents" with a monthly limit of 50000 cents from 6 months ago
    And the budget has a confirmed spend of 300000 cents in "Presents" 5 months ago
    And the budget has a category "Travel" with a monthly limit of 500000 cents from 6 months ago
    And the budget has a confirmed spend of 10000 cents in "Travel" 5 months ago
    And I open the reserve rebalance dialog for "My E2E Budget"

  Scenario: A short reserve is topped up to what its history asked for
    Then the rebalance row for "Presents" offers to "rebalance"
    When I press the rebalance button for "Presents"
    Then the rebalance row for "Presents" offers to "undo"
    And the reserve ledger for "Presents" holds a delta of 200000 cents

  Scenario: The move can be taken back
    When I press the rebalance button for "Presents"
    And I press the rebalance button for "Presents"
    Then the rebalance row for "Presents" offers to "rebalance"
    And the reserve ledger for "Presents" nets to 0 cents

  # A reserve holding "15,000 zł" must not shove its target field further right
  # than one holding "0 zł" (user screenshot, 260805).
  Scenario: Every target field starts in the same place
    Then the rebalance target fields all share one left edge

  Scenario: A typed target is what gets moved, comma and all
    When I set the rebalance target for "Presents" to "1234,56"
    And I press the rebalance button for "Presents"
    Then the rebalance row for "Presents" offers to "undo"
    And the reserve ledger for "Presents" holds a delta of 123456 cents
