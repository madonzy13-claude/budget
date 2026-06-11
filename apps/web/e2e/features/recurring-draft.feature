@phase8
Feature: Recurring drafts — confirm and dismiss flows in Spendings

  Background:
    Given I am signed in as a fresh user

  Scenario: Recurring draft appears in Spendings with a confirm action
    Given a recurring rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    Then the draft row for rule "Rent" is visible
    And the draft confirm button is visible

  Scenario: Confirming a draft removes it from the draft section
    Given a recurring rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    And I confirm the draft for rule "Rent"
    Then the draft row for rule "Rent" is not visible
