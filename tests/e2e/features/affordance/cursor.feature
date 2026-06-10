@cursor-affordance
Feature: Pointer cursor affordance on interactive elements
  Guards the unlayered global cursor rule in apps/web/src/app/global.css so a
  CSS cascade-layer change, Tailwind layer reorder, or build regression cannot
  silently revert every button and link to the default arrow. This was a
  recurring UAT complaint across Phase 7 rounds; the rule is page-independent,
  so the unauthenticated sign-in page is a sufficient and stable probe.

  Scenario: Buttons and links on the sign-in page use a pointer cursor
    When I visit the sign-in page for cursor checks
    Then the sign-in button shows a pointer cursor
    And every link shows a pointer cursor
