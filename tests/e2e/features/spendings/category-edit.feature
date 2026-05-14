@phase4
Feature: Edit category via column header pen action (GRID-03, GRID-04)

  Scenario: Single-click column header reveals pen; clicking pen opens CategorySlider
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I single-click the column header "Groceries"
    And I click the pen action on column header "Groceries"
    Then I see the CategorySlider is open
