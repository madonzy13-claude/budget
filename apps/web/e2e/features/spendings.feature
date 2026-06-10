@phase8
Feature: Spendings tab — quick-entry, offline queue, replay, and sync-issues

  Background:
    Given I am signed in as a fresh user
    And the budget has a category "Groceries" with a monthly limit of 50000 cents

  Scenario: Quick-entry transaction appears in the grid
    When I open the spendings tab for "My E2E Budget"
    And I type a quick-entry of "500" cents into the "Groceries" column
    Then a confirmed transaction row for 500 cents is visible in the grid

  Scenario: Offline quick-entry queues with a pending marker
    When I open the spendings tab for "My E2E Budget"
    And the browser goes offline
    And I type a quick-entry of "1200" cents into the "Groceries" column
    Then a pending-sync marker is visible on the queued transaction
    And the offline status badge is visible

  Scenario: Reconnect replays the queued transaction
    When I open the spendings tab for "My E2E Budget"
    And the browser goes offline
    And I type a quick-entry of "700" cents into the "Groceries" column
    Then a pending-sync marker is visible on the queued transaction
    When the browser comes back online
    Then no pending-sync markers remain in the grid

  Scenario: Sync-issues list shows a failed-replay item
    When I open the spendings tab for "My E2E Budget"
    And a sync-failure is injected into the write queue
    Then the sync-issues list is visible
