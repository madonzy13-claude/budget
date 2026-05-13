@phase4
Feature: Create new category via the dashed-plus column (GRID-08 + D-PH4-S4)

  Scenario: Click add-category column opens CategorySlider and new column appears
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Spendings tab on a budget "Family"
    Then I see the dashed `+` column at the rightmost position
    When I click the Add category column
    Then I see the spendings grid container
