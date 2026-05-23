@phase2
Feature: Search and filter transactions
  As a household member I can find old transactions by text and narrow by category.
  Backed by Postgres FTS on note_tsv (Plan 02-06 GIN index) + cursor pagination (Plan 02-09).

  Background:
    Given I am signed in as a fresh user with workspace "Search Test Workspace"
    And I have a checking account "Main" with currency "EUR"

  Scenario: User searches by note text and a matching transaction is visible
    Given I have an expense "Latte coffee" of 5 EUR on "2026-05-08"
    And I have an expense "Groceries weekly" of 50 EUR on "2026-05-08"
    When I open the Transactions page
    And I search transactions for "coffee"
    Then I see a transaction in the list with amount "5"
