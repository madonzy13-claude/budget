@phase4 @mobile
Feature: Mobile horizontal scroll with many categories (GRID-13, D-PH4-Q6)

  Scenario: Grid scrolls horizontally on mobile viewport with many categories
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Cat1" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat2" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat3" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat4" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat5" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat6" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat7" with planned "100.00" "EUR"
    And the budget "Family" has a category "Cat8" with planned "100.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    Then I see the spendings grid container
    And I see the dashed `+` column at the rightmost position
