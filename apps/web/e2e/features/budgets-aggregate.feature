@aggregate @phase12
Feature: All-budgets aggregate overview

  Background:
    Given I am signed in as a fresh user
    # These scenarios convert between currencies, and a cache MISS makes the
    # aggregate endpoint call api.frankfurter.dev live. Warm it so CI does not
    # depend on a third-party API being quick (260814).
    And the FX cache is warm

  Scenario: Combined net worth sums budgets across currencies; excluding one drops the total
    Given I have a budget "Home" in "USD" with a wallet balance of 500000 cents
    And I have a budget "Travel" in "EUR" with a wallet balance of 300000 cents
    When I open the all-budgets view
    Then the aggregate hero shows a combined net worth greater than 500000 minor units
    When I exclude the "Travel" budget from the aggregate
    And I open the all-budgets view
    Then the aggregate hero decreases

  Scenario: Lowering my self-set ownership share shrinks that budget's contribution
    Given I have a budget "Home" in "USD" with a wallet balance of 500000 cents
    And I have a budget "Travel" in "EUR" with a wallet balance of 300000 cents
    When I open the all-budgets view
    Then the aggregate hero shows a combined net worth greater than 500000 minor units
    When I set my ownership share of the "Home" budget to 50 percent
    And I open the all-budgets view
    Then the aggregate hero decreases

  Scenario: The include-in-aggregation toggle is hidden with a single budget
    Given I have a budget "Solo" in "USD" with a wallet balance of 100000 cents
    When I open the general settings for "Solo"
    Then the include-in-aggregation toggle is not visible

  # Every per-budget call this page makes carries no budget in the URL, so the
  # header had to come from somewhere else. It came from nowhere, and each call
  # 403'd and retried — invisibly, because nothing on screen depends on it.
  # The TASK is what makes this reproduce: the page draws a banner per pending
  # task, and resolving its title is the only thing here that asks for a budget's
  # categories. Without one the page never makes the call and the scenario passes
  # against the broken build, proving nothing — as it did on the first attempt.
  Scenario: The all-budgets page asks for nothing it is not allowed
    Given I have a budget "Home" in "USD" with a wallet balance of 500000 cents
    And I have a budget "Travel" in "EUR" with a wallet balance of 300000 cents
    And a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "USD"
    And I am recording forbidden responses
    When I open the all-budgets view
    Then a task banner is showing
    And no request came back forbidden
