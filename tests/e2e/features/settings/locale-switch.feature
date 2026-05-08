Feature: Settings — Language locale switch

  Scenario: Switching to Polish navigates to /pl and persists across reload
    Given a fresh verified user in "en"
    When I navigate to "/en/settings"
    And I open the Language tab
    And I switch the language to "pl"
    Then the URL is on locale "pl"
    And the locale API responded 200
    When I reload the page
    Then the URL is on locale "pl"

  Scenario: Switching to Ukrainian navigates to /uk and persists across reload
    Given a fresh verified user in "en"
    When I navigate to "/en/settings"
    And I open the Language tab
    And I switch the language to "uk"
    Then the URL is on locale "uk"
    And the locale API responded 200
    When I reload the page
    Then the URL is on locale "uk"
