@phase8
Feature: Scheduled drafts — confirm and dismiss flows in Spendings

  Background:
    Given I am signed in as a fresh user

  Scenario: Scheduled draft appears in Spendings with a confirm action
    Given a scheduled rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    Then the draft row for rule "Rent" is visible
    And the draft confirm button is visible

  Scenario: Confirming a draft removes it from the draft section
    Given a scheduled rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    And I confirm the draft for rule "Rent"
    Then the draft row for rule "Rent" is not visible

  # user, 261017: moving an existing MONTHLY payment to today saved it as the
  # same day NEXT month and drafted nothing.
  Scenario: Moving a monthly payment to today drafts it today
    Given a scheduled rule "Rent" is due in 10 days in budget "My E2E Budget"
    When I open the settings tab for "My E2E Budget"
    And I move the scheduled rule "Rent" to today
    And I open the spendings tab for "My E2E Budget"
    Then the draft row for rule "Rent" is visible
