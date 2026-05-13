@phase4
Feature: Dismiss a recurring draft (RECR-06, D-PH4-R3)

  Scenario: Dismiss draft makes row disappear; recurring rule remains active
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Transport" with planned "200.00" "EUR"
    And the budget "Family" has a recurring rule "Bus Pass" for category "Transport" of "30.00" "EUR" due this month
    When I open the Spendings tab on a budget "Family"
    Then I see the spendings grid container
