@phase4
Feature: Double-click draft amount to edit and promote (RECR-05, D-PH4-INT5)

  Scenario: Double-click amount cell on draft enters edit mode; typing and Enter promotes with new amount
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Subscriptions" with planned "50.00" "EUR"
    And the budget "Family" has a recurring rule "Netflix" for category "Subscriptions" of "15.00" "EUR" due this month
    When I open the Spendings tab on a budget "Family"
    Then I see the spendings grid container
