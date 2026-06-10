Feature: Friendly 404 screen

  Any URL that doesn't match a route under /[locale]/ resolves to the
  shared friendly 404 page. The page must render the brand wordmark
  header (so the user can reach home without using browser chrome — which
  is hidden on installed PWAs), a localized title and body, and an
  explicit "Take me home" button that returns to /[locale].

  Scenario: 404 renders in English
    When I navigate to an unmatched url under "en"
    Then I see the friendly 404 screen in "en"

  Scenario: 404 renders in Polish
    When I navigate to an unmatched url under "pl"
    Then I see the friendly 404 screen in "pl"

  Scenario: 404 renders in Ukrainian
    When I navigate to an unmatched url under "uk"
    Then I see the friendly 404 screen in "uk"

  Scenario: Home button takes the user back to the locale root
    When I navigate to an unmatched url under "en"
    And I click the not-found home button
    Then I am no longer on the unmatched url
