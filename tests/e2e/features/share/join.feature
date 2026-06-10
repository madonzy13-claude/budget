@phase6
Feature: Share — recipient joins a shared budget via invite link (SHRD-04)

  Scenario: Unauthenticated recipient can see the join page without being bounced to sign-in
    Given a budget owner has created a shared budget "Shared Budget"
    And the owner has generated a share link for that budget
    When an unauthenticated user visits the share link
    Then they see the join page card
    And they see the "Sign in to accept" button

  Scenario: Authenticated recipient accepts a valid link and lands on spendings
    Given a budget owner has created a shared budget "Join Test Budget"
    And the owner has generated a share link for that budget
    And I am signed in as a fresh user with workspace "My Own Budget"
    When I visit the share link
    Then I see the join page card with the budget name "Join Test Budget"
    And I see the "Join budget" button
    When I click the join button
    Then I land on the spendings tab for "Join Test Budget"

  Scenario: Revoked or expired link shows the error state
    Given a share link with token "invalid-token-00000"
    When I visit the share link
    Then I see an error state on the join page
    And I see a link to return home
