@settings-profile
Feature: User settings — Profile section (name + email change)
  # Covers USET-04: a signed-in user edits their account NAME (persists via
  # authClient.updateUser) and requests an EMAIL change (authClient.changeEmail
  # → a confirmation link goes to the CURRENT address before the switch).
  #
  # The email_hash recompute + re-verify hop is proven at the DB layer by
  # packages/identity/test/email-change-hash.test.ts; here we assert the UI
  # wiring (the action fires + the user sees the right notice). Multi-locale
  # rendering is covered by the component test + i18n parity check, so these
  # scenarios stay EN-only.

  Background:
    Given I am signed in as a fresh user

  Scenario: Changing the account name shows a success notice
    When I open the User settings page
    And I set the profile name to "Renamed E2E"
    Then I see the settings notice "Name updated"

  Scenario: Requesting an email change shows the confirmation-sent notice on a phone
    Given I am on a phone-sized viewport
    When I open the User settings page
    And I request an email change to "changed-e2e@example.com"
    Then I see the settings notice "Confirmation sent"
