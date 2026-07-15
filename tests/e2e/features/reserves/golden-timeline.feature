# @ci-only: documented cover-dialog/cold-cache timing flake (per-cell golden
# replay). Runs in CI with retries; skipped in local runs to avoid false
# failures. See playwright.config.ts grepInvert.
@tasks-redesign @reserves-golden @ci-only
Feature: Reserves golden table — full timeline through the real UI

  Drives the canonical reserve golden table (the SAME csv the pure-engine golden
  test asserts: packages/budgeting/test/domain/reserve-engine.golden.csv) through
  the real browser. Two categories (Grocery + Housing), wallet edits, reserve
  adjusts (including the cover-overspend popup), transaction add / edit / remove,
  cushion-mode toggles and limit changes — asserting EVERY visible cell after each
  action: per-category overspent / reserves-used / left on the spendings grid, and
  per-category available reserve + TOTAL AVAILABLE + TOTAL IN WALLETS on the
  reserves tab. The action's own tab is asserted live (no reload) right after the
  mutation, so a stale-cache regression cannot hide. A failure names the exact
  offending row and cell.

  The two closing "July" adjusts (a closed-month adjust must not cover a past
  month's overspent) depend on the server wall-clock being in the next month,
  which the real-clock June walk can't reproduce; they are covered by the engine
  golden, the orchestrator replay, and the dedicated closed-month scenario.

  Scenario: every visible cell matches the golden table after each action
    Given I am signed in as a fresh user with workspace "Reserves"
    And the reserves golden fixture is seeded for "Reserves"
    When I replay the reserves golden timeline through the real UI
    Then every golden row matched the rendered cells
