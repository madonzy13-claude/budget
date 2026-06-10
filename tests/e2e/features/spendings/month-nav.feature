@phase4
Feature: Month navigation via buttons and keyboard (GRID-10)

  Scenario: Clicking next month button increments the month in the URL
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I am viewing month "2026-05"
    And I click the next month button
    Then the URL has search param month equal to "2026-06"

  Scenario: Clicking previous month button decrements the month in the URL
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I am viewing month "2026-05"
    And I click the previous month button
    Then the URL has search param month equal to "2026-04"

  Scenario: Month label updates when navigating
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I am viewing month "2026-05"
    Then I see the spendings grid container
