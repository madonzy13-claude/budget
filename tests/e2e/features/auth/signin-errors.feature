Feature: Sign-in error localization

  Scenario Outline: Invalid credentials shows localized message
    Given I am on the "<locale>" sign-in page
    When I submit the sign-in form with a nonexistent email and password "wrongpw1234!"
    Then I see the "<locale>" invalid-credentials error
    And I am redirected to a sign-in page

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |
