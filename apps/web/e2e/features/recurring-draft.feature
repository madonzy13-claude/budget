@phase8
Feature: Recurring drafts — confirm and dismiss flows in Spendings

  Background:
    Given I am signed in as a fresh user

  Scenario: Recurring draft appears in Spendings with a confirm action
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "USD"
    When I open the spendings tab for "My E2E Budget"
    Then the draft row for rule "Rent" is visible
    And the draft confirm button is visible

  Scenario: Confirming a draft removes it from the draft section
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "USD"
    When I open the spendings tab for "My E2E Budget"
    And I confirm the draft for rule "Rent"
    Then the draft row for rule "Rent" is not visible
