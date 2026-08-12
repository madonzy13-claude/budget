@phase4
Feature: Confirm a scheduled draft (RECR-03, RECR-04)

  Scenario: Pending draft appears; single-click reveals Confirm action; confirming promotes to transaction
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Rent" with planned "1200.00" "EUR"
    And the budget "Family" has a scheduled rule "Rent Payment" for category "Rent" of "1200.00" "EUR" due this month
    When I open the Spendings tab on a budget "Family"
    Then I see the spendings grid container
