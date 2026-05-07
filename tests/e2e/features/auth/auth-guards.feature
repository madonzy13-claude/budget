Feature: Auth guards

  Scenario Outline: Unauthenticated user redirected from <route> to sign-in
    When I navigate to "<route>"
    Then I am redirected to a sign-in page

    Examples:
      | route          |
      | /en/onboarding |
      | /en/workspaces |
      | /en/settings   |

  Scenario: Authenticated user on /sign-in is redirected to /workspaces
    Given a fresh verified user in "en"
    When I navigate to "/en/sign-in"
    Then I am redirected to a workspaces page

  Scenario: Authenticated user on /sign-up is redirected to /workspaces
    Given a fresh verified user in "en"
    When I navigate to "/en/sign-up"
    Then I am redirected to a workspaces page
