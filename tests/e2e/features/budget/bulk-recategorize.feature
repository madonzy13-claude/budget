@phase4
Feature: Bulk re-categorize transactions across columns (EXPN-10)
  As a household member I can move several transactions from one category column to
  another in a single atomic operation. The originating column loses them and the
  destination column gains them; no correction-row badge is rendered in v1.1
  (in-place edit per TXN-08 / D-PH2-07).

  Background:
    Given I am signed in as a fresh user with workspace "Bulk Test"
    And the budget "Bulk Test" has a category "Food" with planned "0.00" "EUR"
    And the budget "Bulk Test" has a category "Eating Out" with planned "0.00" "EUR"
    And the budget "Bulk Test" has a transaction "10.00" "EUR" in category "Food"
    And the budget "Bulk Test" has a transaction "20.00" "EUR" in category "Food"

  Scenario: User bulk re-categorizes 2 transactions to a new category
    When I open the Spendings tab on a budget "Bulk Test"
    And I bulk re-categorize all "Food" transactions to "Eating Out"
    Then I see a transaction row "10.00" in the "Eating Out" column
    And I see a transaction row "20.00" in the "Eating Out" column
    And I do not see a transaction row "10.00" in the "Food" column
    And I do not see a transaction row "20.00" in the "Food" column
