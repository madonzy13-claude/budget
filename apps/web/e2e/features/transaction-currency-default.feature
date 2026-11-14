@transaction-currency-default
Feature: Spending in a category that has its own currency
  # Phase 14 (D-05, D-08): a category carries a currency. Quick entry in it is
  # in that currency, and its whole column reads in that currency (user,
  # 261103: no budget-currency equivalent beside it).

  Background:
    Given I am signed in as a fresh user
    And the FX rate "EUR" to "USD" on "today" is "1.08"
    And a "EUR" category "Travel" with a 500.00 limit exists in my budget

  Scenario: Quick entry in a EUR category is a EUR spending
    When I open the spendings tab for the budget
    And I quick-enter "20" in the "Travel" column
    Then the newest "Travel" spending reads in "€"

  Scenario: A EUR category reads its column in euros
    When I open the spendings tab for the budget
    Then the "Travel" limit reads in "€"
