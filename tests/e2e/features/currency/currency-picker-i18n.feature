@skip-phase-05-debt
Feature: Currency picker localization on the onboarding wizard

  Scenario Outline: <locale> trigger and dropdown options are localized
    Given a fresh verified user in "<locale>"
    When I navigate to "/<locale>/onboarding"
    And I open the currency picker
    Then the currency picker shows the "<locale>" trigger placeholder
    And the currency picker offers the US-dollar option in "<locale>"
    And the currency picker offers the Ukrainian-hryvnia option in "<locale>"

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |
