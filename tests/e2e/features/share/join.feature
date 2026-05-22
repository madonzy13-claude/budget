@phase6
Feature: Share — recipient joins a shared budget via invite link (SHRD-04)

  # TODO: Plan 06-08 — implement Page Objects and step bindings for share join flow

  @skip-wip
  Scenario: Recipient accepts a valid invite link and joins the budget
    # TODO: Plan 06-08
    Given a budget owner has generated a share invite link
    When a new user visits the invite link
    Then they see the budget name and an Accept invitation button
    When they click Accept invitation
    Then they are added as a member of the budget
    And redirected to the shared budget dashboard

  @skip-wip
  Scenario: Expired invite link shows expiry message
    # TODO: Plan 06-08
    Given an invite link that has expired
    When a user visits the expired invite link
    Then they see an expiry message
    And a prompt to request a new invitation

  @skip-wip
  Scenario: Already-member user sees info message on invite link
    # TODO: Plan 06-08
    Given a user who is already a member of the budget
    When they visit the invite link for that budget
    Then they see an already-member message
    And a link to go to the budget directly
