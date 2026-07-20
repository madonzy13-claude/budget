@aggregate @phase12
Feature: All-budgets aggregate overview

  Background:
    Given I am signed in as a fresh user

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
