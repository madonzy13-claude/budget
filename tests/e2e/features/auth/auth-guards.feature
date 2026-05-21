Feature: Auth guards

  Unauthenticated users must be bounced off any of the app's protected route
  trees to /sign-in. Authenticated users must be bounced off /sign-in and
  /sign-up back to the app's home page. PROTECTED_ROUTES in
  apps/web/src/middleware.ts is the source of truth for the redirect set.

  Scenario Outline: Unauthenticated user redirected from <route> to sign-in
    When I navigate to "<route>"
    Then I am redirected to a sign-in page

    Examples:
      | route          |
      | /en/onboarding |
      | /en/budgets    |
      | /en/settings   |

  Scenario: Authenticated user on /sign-in is redirected to the app home
    Given a fresh verified user in "en"
    When I navigate to "/en/sign-in"
    Then I am redirected to the app home page

  Scenario: Authenticated user on /sign-up is redirected to the app home
    Given a fresh verified user in "en"
    When I navigate to "/en/sign-up"
    Then I am redirected to the app home page
