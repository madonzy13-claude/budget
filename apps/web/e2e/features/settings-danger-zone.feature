@settings-danger
Feature: Account deletion (Danger Zone)
  # Covers USET-06: email-gated account deletion. Typing DELETE sends a
  # confirmation email; opening the emailed link runs the cascade and removes the
  # account (after which the old credentials no longer work).

  Background:
    Given I am signed in as a fresh user

  Scenario: Delete the account end-to-end via the emailed confirmation link
    When I open the Danger Zone
    And I confirm account deletion by typing DELETE
    Then I see the settings notice "Check your email"
    When I open the account-deletion link from my email
    Then I cannot sign in with my old account
