@phase2
Feature: Editing a recurring rule with "Also apply to future occurrences" pre-checked updates upcoming pending drafts

  Background:
    Given I am signed in as a fresh user with workspace "Apply To Future Workspace"
    And I have a checking account "Main" with currency "USD"

  Scenario: User edits a rule's amount; pre-checked checkbox propagates to the existing PENDING draft
    Given I have a monthly recurring rule "Rent" of 1500 USD anchored to day 1
    And the engine has generated a PENDING draft for "Rent" at 1500 USD
    When I open the Recurring page
    And I open the edit form for the recurring rule "Rent"
    Then the "Also apply to future occurrences" checkbox is checked
    When I change the recurring rule amount to "1600"
    And I save the recurring rule
    Then I see a recurring rule in the list with amount "1600"
    And I see a pending draft with amount "1600"
