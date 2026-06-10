@phase4
Feature: Drag-reorder columns persists to sort_index (GRID-09)

  Scenario: Column order persists after drag and page reload
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Alpha" with planned "100.00" "EUR"
    And the budget "Family" has a category "Beta" with planned "100.00" "EUR"
    And the budget "Family" has a category "Gamma" with planned "100.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I drag column "Alpha" before column "Gamma"
    Then I see the column order is "Beta, Alpha, Gamma"
