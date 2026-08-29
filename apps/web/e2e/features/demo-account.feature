@demo
Feature: Demo account
  # Phase 12. The demo is ONE shared login handed to prospects, rebuilt nightly
  # from scrubbed copies of two real budgets.
  #
  # The scenario that earns its keep is the last one: a second, independent
  # browser context must start clean. Without it nothing catches the language
  # choice being persisted to the shared user row, which would silently make
  # the first visitor's language everyone's.

  Scenario: Visiting /demo signs the prospect in
    When I open "/en/demo"
    Then I am signed in
    And the demo banner is visible

  Scenario: The welcome dialog explains the demo and offers three languages
    When I open "/en/demo"
    Then the demo welcome dialog is visible
    And the dialog offers "English", "Polski" and "Українська"

  Scenario: Choosing a language switches the interface
    When I open "/en/demo"
    And I choose "Polski" in the demo welcome dialog
    Then the URL contains "/pl/"

  Scenario: The dialog does not reappear for the same visitor
    When I open "/en/demo"
    And I dismiss the demo welcome dialog
    And I reload the page
    Then the demo welcome dialog is not visible

  Scenario: A second visitor is unaffected by the first visitor's language
    # The shared-account assertion. A fresh browser context stands in for the
    # next prospect: they must get the default locale and their own dialog.
    Given a visitor chose "Polski" in the demo welcome dialog
    When a different visitor opens "/en/demo"
    Then that visitor sees the demo welcome dialog
    And that visitor's URL contains "/en/"

  Scenario: Both demo budgets are present and the aggregate spans two currencies
    When I open "/en/demo"
    Then the budget switcher lists 2 budgets
    And the all-budgets overview renders a total

  Scenario: Restricted actions are blocked on the demo account
    When I open "/en/demo"
    And I attempt to invite a member
    Then the action is refused as demo-restricted
