Feature: Sign-up form

  Scenario: Root redirects to /en/sign-in
    When I navigate to "/"
    Then I am redirected to a sign-in page

  Scenario: Sign-up form shows all fields
    Given I am on the "en" sign-up page
    Then the sign-up form fields are visible

  Scenario Outline: Empty-form validation shows localized error
    Given I am on the "<locale>" sign-up page
    When I trigger empty-form validation on the sign-up form
    Then I see the "<locale>" name-required error

    Examples:
      | locale |
      | en     |
      | uk     |

  Scenario: Email placeholder is not localised in uk
    Given I am on the "uk" sign-up page
    Then the email-address input has placeholder "you@example.com"
