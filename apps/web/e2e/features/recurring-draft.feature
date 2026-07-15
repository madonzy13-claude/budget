@phase8
Feature: Recurring drafts — confirm and dismiss flows in Spendings

  Background:
    Given I am signed in as a fresh user

  Scenario: Recurring draft appears in Spendings with a confirm action
    Given a recurring rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    Then the draft row for rule "Rent" is visible
    And the draft confirm button is visible

  # @ci-only: confirm→disappear is load-sensitive (RSC re-render race under a
  # contended runner); passes 6/6 locally. Runs in CI (with retries), skipped
  # in local runs. See playwright.config.ts grepInvert.
  @ci-only
  Scenario: Confirming a draft removes it from the draft section
    Given a recurring rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    And I confirm the draft for rule "Rent"
    Then the draft row for rule "Rent" is not visible
