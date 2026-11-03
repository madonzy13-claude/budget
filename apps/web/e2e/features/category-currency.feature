@category-currency
Feature: A category has its own currency
  # Phase 14 (D-04, D-07, D-03): a new category takes the budget currency; its
  # currency can change later — the limit converts at today's rate and past
  # spendings keep the currency they were paid in.

  Background:
    Given I am signed in as a fresh user

  Scenario: A new category is created in the budget currency
    When I open the spendings tab for the budget
    And I add a category "Books" without touching its currency
    And I open the edit slider for "Books"
    Then the category currency reads "USD"

  Scenario: Changing a category's currency converts its limit; new spendings follow it
    Given a "USD" category "Food" with a 1000.00 limit exists in my budget
    When I open the spendings tab for the budget
    And I open the edit slider for "Food"
    And I change the category currency to "EUR"
    Then the currency change hint is shown with the limit in "€"
    When I save the category
    And I open the edit slider for "Food"
    Then the category currency reads "EUR"
    When I close the category slider
    And I quick-enter "5" in the "Food" column
    Then the newest "Food" spending reads in "€"
