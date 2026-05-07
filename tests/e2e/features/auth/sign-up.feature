Feature: Sign Up

  Scenario: Creates account and lands on sign-in with verify-pending banner
    Given I am on the "en" sign-up page
    When I submit the sign-up form with name "E2E Test User", a unique email, password "testpassword123!"
    Then I am redirected to a sign-in page with verify-pending
    And the verify-pending banner is visible
