Feature: Email verification required for sign-in

  Scenario: Sign-up does not create a session and lands on sign-in with verify-pending
    Given I am on the "en" sign-up page
    When I sign up with a fresh email name "Verify Required User" password "testpassword123!" in "en"
    Then I am redirected to a sign-in page with verify-pending
    And the verify-pending banner is visible
    And the better-auth session cookie is absent
    When I navigate to "/en/workspaces"
    Then I am redirected to a sign-in page

  Scenario Outline: Pre-verify sign-in shows localized error
    Given I am on the "<locale>" sign-up page
    When I sign up with a fresh email name "Pre-Verify User" password "testpassword123!" in "<locale>"
    Then I am redirected to a sign-in page with verify-pending
    Given I am on the "<locale>" sign-in page
    When I submit the sign-in form with the fresh email and password "testpassword123!"
    Then I see the "<locale>" email-not-verified error
    And I am redirected to a sign-in page

    Examples:
      | locale |
      | en     |
      | uk     |

  Scenario: Verified user lands on workspaces after verification
    Given a fresh verified user in "en"
    Then I am redirected to a workspaces page

  Scenario: Verified user can sign out and back in
    Given a fresh verified user in "en"
    Then I am redirected to a workspaces page
    When I click the sign-out button
    Then I am redirected to a sign-in page
    When I sign in with the fresh user's credentials in "en"
    Then I am redirected to a workspaces page
    And the email-not-verified error is not visible
