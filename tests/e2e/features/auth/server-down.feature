Feature: Server-down screen

  When the backend api container is unreachable from the web container,
  every authenticated route resolves to /[locale]/server-down — a friendly
  localised "we can't reach the server" message with a Retry button.
  Retry probes /api/health; on success the page reloads to the originally
  requested route, on failure an inline still-unreachable message shows
  and the user stays on the screen.

  The direct route render and the Retry behaviour are verified here with
  the /api/health probe stubbed via Playwright route interception. The
  RSC-side failure (api container actually down → (app)/layout.tsx
  redirect) is covered by the manual smoke step in the debug session
  file and the post-fix verification recipe.

  Scenario: Server-down screen renders in English
    When I open the "en" server-down page
    Then I see the server-down screen in "en"

  Scenario: Server-down screen renders in Polish
    When I open the "pl" server-down page
    Then I see the server-down screen in "pl"

  Scenario: Server-down screen renders in Ukrainian
    When I open the "uk" server-down page
    Then I see the server-down screen in "uk"

  Scenario: Retry while server is still down shows still-unreachable message
    Given the api health endpoint is unreachable
    When I open the "en" server-down page
    And I click the server-down retry button
    Then I see the server-down still-unreachable message

  Scenario: Retry after server comes back reloads the page
    Given the api health endpoint is reachable
    When I open the "en" server-down page
    And I click the server-down retry button
    Then I leave the server-down page
