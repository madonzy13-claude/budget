Feature: Sign Out

  Scenario: Renders sign-out button in authenticated layout
    Given a fresh verified user in "en"
    Then the sign-out button is visible

  Scenario: Clicking sign-out clears session and redirects to sign-in
    Given a fresh verified user in "en"
    When I click the sign-out button
    Then I am redirected to a sign-in page
    And the get-session API returns null

  Scenario: After sign-out protected routes redirect to sign-in
    Given a fresh verified user in "en"
    When I click the sign-out button
    And I navigate to "/en/workspaces"
    Then I am redirected to a sign-in page

  Scenario: Sign-out button hidden on unauthenticated routes
    When I navigate to "/en/sign-in"
    Then the sign-out button is hidden
