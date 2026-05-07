Feature: Duplicate sign-up rejection

  Scenario: Repeat sign-up with same email does not create a second user
    Given I am on the "en" sign-up page
    When I sign up with a fresh email name "Original" password "testpassword123!" in "en"
    Then I am redirected to a sign-in page with verify-pending
    Given I am on the "en" sign-up page
    When I sign up with the same email name "Imposter" password "differentpw1234!" in "en"
    Then I am redirected to a sign-in page with verify-pending
    When I post to the sign-in email endpoint with the original email and password "testpassword123!"
    Then the API response status is 403
    And the API response body contains "EMAIL_NOT_VERIFIED"
    When I post to the sign-in email endpoint with the original email and password "differentpw1234!"
    Then the API response status is 401
    And the API response body contains "INVALID_EMAIL_OR_PASSWORD"

  Scenario: Uppercase email variant treated as duplicate
    Given I am on the "en" sign-up page
    When I sign up with a fresh email name "Lowercase" password "testpassword123!" in "en"
    Then I am redirected to a sign-in page with verify-pending
    Given I am on the "en" sign-up page
    When I sign up with the same email uppercased name "Uppercase" password "differentpw1234!" in "en"
    Then I am redirected to a sign-in page with verify-pending
