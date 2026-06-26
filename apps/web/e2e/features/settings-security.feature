@settings-security
Feature: User settings — Security section (password + sessions)
  # Covers USET-05: an email-gated password change (reuses the reset flow — a
  # button emails a link to the account's own address, no in-app new-password
  # entry) and the active-sessions list with "sign out all other devices".

  Background:
    Given I am signed in as a fresh user

  Scenario: Change password emails a reset link to the account address
    When I open the Security section
    And I click change password
    Then I see the settings notice "Check your email"

  Scenario: Sign out all other devices leaves only the current session
    Given I am on a phone-sized viewport
    And I have a second active session
    When I open the Security section
    Then I see the sign-out-others control
    When I sign out all other devices
    Then I see the settings notice "Signed out all other devices"
    And the sign-out-others control is gone
