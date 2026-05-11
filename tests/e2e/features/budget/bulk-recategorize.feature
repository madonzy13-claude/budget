@phase2
Feature: Bulk re-categorize transactions
  As a household member I can multi-select transactions and re-categorize them; the system writes
  one correction row per selection in a single tx (Plan 02-09 EXPN-10, atomic-all-or-none).

  Background:
    Given I am signed in as a fresh user with workspace "Bulk Test Workspace"
    And I have a checking account "Main" with currency "EUR"
    And I have a category "Food"
    And I have a category "Eating Out"

  Scenario: User bulk re-categorizes 2 transactions to a new category
    Given I have an expense "Lunch" of 10 EUR on "2026-05-07" in category "Food"
    And I have an expense "Dinner" of 20 EUR on "2026-05-08" in category "Food"
    When I bulk re-categorize all "Food" transactions to "Eating Out"
    Then I see 2 transactions with the "edited" badge
