@install-app
Feature: Installing the app
  # user, 261023: an Android customer removed the app to reinstall it and the
  # install banner + menu item never came back — the "installed" flag from the
  # first install outlives an uninstall.

  Background:
    Given I am signed in as a fresh user

  Scenario: The install offer comes back after the app was removed
    Given I am on a phone-sized viewport
    And I installed the app before and removed it
    When I open the home page
    And Chrome offers to install the app
    Then I am offered to install the app
