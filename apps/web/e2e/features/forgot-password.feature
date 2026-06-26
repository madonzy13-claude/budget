@forgot-password
Feature: Logged-out password reset (forgot + reset pages)
  # Covers USET-07: the two missing logged-out pages and the fixed sign-in link.
  # The fresh-user fixture gives a real verified account; we sign the browser out
  # and drive the reset as a logged-out visitor.

  Background:
    Given I am signed in as a fresh user
    And I am signed out in the browser

  Scenario: Request a reset link, open it, and set a new password
    When I request a password reset for my account
    Then I see the reset-sent confirmation
    When I open the reset link from my email
    And I set a new password "brandnewpass123"
    Then I land on the sign-in page

  Scenario: The reset page rejects a missing token
    When I open the reset page without a token
    Then I see the expired-token error

  Scenario: The sign-in "Forgot password?" link goes to the forgot-password page
    When I open the sign-in page
    And I click the forgot-password link
    Then the URL contains "/forgot-password"
