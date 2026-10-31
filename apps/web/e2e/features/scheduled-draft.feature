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

  # User (R6): a future date sets the payment aside — it comes back, waiting
  # for confirmation, on that date (the daily engine; covered by its tests).
  @r6-draft-future
  Scenario: Moving an unconfirmed payment to a future date sets it aside
    Given a scheduled rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    And I move the unconfirmed payment for rule "Rent" to 40 days from now
    Then the draft row for rule "Rent" is not visible

  # User (R6): an earlier date just moves it — into last month here.
  @r6-draft-past
  Scenario: Moving an unconfirmed payment into last month moves it there
    Given a scheduled rule "Rent" is due this month in budget "My E2E Budget"
    When I open the spendings tab for "My E2E Budget"
    And I move the unconfirmed payment for rule "Rent" to the 10th of last month
    Then the draft row for rule "Rent" is not visible

