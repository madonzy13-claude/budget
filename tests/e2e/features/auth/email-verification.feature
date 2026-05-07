Feature: Email verification

  Scenario Outline: <locale> sign-up delivers localized verification email
    Given I am on the "<locale>" sign-up page
    When I sign up with a fresh email name "E2E Verify User" password "testpassword123!" in "<locale>"
    Then I am redirected to a sign-in page with verify-pending
    And a Mailpit message is delivered to that email
    And the Mailpit message subject matches the "<locale>" verify-subject
    And the Mailpit message body contains a verify-email URL

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |

  Scenario: Clicking the verification link completes the flow
    Given I am on the "en" sign-up page
    When I sign up with a fresh email name "E2E Verify Click User" password "testpassword123!" in "en"
    Then I am redirected to a sign-in page with verify-pending
    When I open the verification link from the latest Mailpit message
    Then I am NOT on a sign-in page
