@app-update
Feature: The app keeps itself on the latest version
  # user, 261023: deploys didn't reach the installed app until it was swiped
  # away. The app now compares its build with the server's, reloads itself when
  # nobody is using it, and Settings says which version runs.

  Background:
    Given I am signed in as a fresh user
    And the app runs without its offline worker

  Scenario: Settings shows the running version as the latest
    When I open the user settings
    Then settings say I have the latest version

  Scenario: A stale app updates itself on open, retries clean once, then stops
    Given the server runs a newer build
    When I open the user settings
    # open → plain reload → clean reload → the build is still "old" → stop
    Then the app reloads itself 3 times and then stays put
    And settings offer Update now

  Scenario: Update now reloads the app
    Given the server runs a newer build
    When I open the user settings
    And the app reloads itself 3 times and then stays put
    And I tap Update now
    Then the app reloads itself 4 times and then stays put

  Scenario: The newest version is announced once it is installed
    Given an update has just been installed
    When I open the user settings
    Then I see that the newest version was installed
    And settings say I have the latest version
