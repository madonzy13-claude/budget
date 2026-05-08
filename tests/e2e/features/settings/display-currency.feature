Feature: Settings — Display currency

  Scenario: User selects a display currency and the choice persists across reload
    Given a fresh verified user in "en"
    When I navigate to "/en/settings"
    And I open the Display currency tab
    And I pick the "UAH" display currency
    Then the display-currency API responded 200
    When I reload the page
    And I open the Display currency tab
    Then the display currency trigger shows "Ukrainian Hryvnia"
