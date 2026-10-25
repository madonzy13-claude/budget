@pull-to-refresh
Feature: Pull to refresh from the header
  # In the installed app the header is the pull-to-refresh handle. It must work
  # wherever the page is scrolled (user, 261023: it only worked at the very top).

  Background:
    Given I am signed in as a fresh user

  Scenario: Pulling the header refreshes even when the page is scrolled down
    Given I am on a phone-sized viewport
    And I use the installed app
    And investments are enabled for my budget
    And 15 custom holdings exist in my budget
    When I open the BDP wallets tab for "My E2E Budget"
    And I scroll the page down
    And I pull down from the header
    Then the refresh indicator appears
