@budget-currency-change
Feature: Changing the budget currency
  # Phase 14 (D-01, D-02, D-03, D-06): the owner can change the budget
  # currency at any time. Totals re-express in the new currency; transactions
  # keep theirs; existing categories keep theirs; going back is lossless.

  Background:
    Given I am signed in as a fresh user
    And the FX rate "USD" to "EUR" on "today" is "0.92"
    And the FX rate "EUR" to "USD" on "today" is "1.087"
    And a "USD" category "Food" with a 1000.00 limit exists in my budget
    And I open the spendings tab for the budget
    And I quick-enter "100" in the "Food" column

  Scenario: Switching to EUR keeps old spendings in dollars and survives a reload
    When I open the settings tab for "My E2E Budget"
    And I change the budget currency to "EUR"
    And I open the spendings tab for the budget
    Then the newest "Food" spending reads in "$"
    And the "Food" limit reads in "$" with an equivalent line beneath it
    When I reload the spendings page
    Then the newest "Food" spending reads in "$"

  Scenario: A category added after the change takes the new currency; old ones keep theirs
    When I open the settings tab for "My E2E Budget"
    And I change the budget currency to "EUR"
    And I open the spendings tab for the budget
    And I add a category "Trips" without touching its currency
    And I open the edit slider for "Trips"
    Then the category currency reads "EUR"
    When I close the category slider
    And I open the edit slider for "Food"
    Then the category currency reads "USD"

  Scenario: Going back to the original currency restores it
    When I open the settings tab for "My E2E Budget"
    And I change the budget currency to "EUR"
    And I change the budget currency to "USD"
    And I open the spendings tab for the budget
    Then the newest "Food" spending has no currency sign

  Scenario: Cancelling the dialog changes nothing
    When I open the settings tab for "My E2E Budget"
    And I pick "EUR" as the budget currency and cancel
    Then the budget currency reads "USD"
