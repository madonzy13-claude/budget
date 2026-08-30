@demo
Feature: Demo account
  # Phase 12. The demo is reached from the SIGN-IN page: a link opens a language
  # picker, and the chosen language signs the visitor into that language's own
  # demo account. Each language is a separate account because the data itself —
  # categories, notes, wallets — is stored in one language rather than
  # translated at render time.

  Scenario: The sign-in page offers a way into the demo
    When I open the sign-in page as a new visitor
    Then the demo entry link is visible

  Scenario: The demo link opens a language picker
    When I open the sign-in page as a new visitor
    And I click the demo entry link
    Then the demo language picker is visible
    And the picker offers "English", "Polski" and "Українська"

  Scenario: Choosing English signs the visitor into the English demo
    When I open the sign-in page as a new visitor
    And I click the demo entry link
    And I choose "English" in the demo language picker
    Then I am signed in
    And the demo banner is visible
    And the URL contains "/en"

  Scenario: Choosing Polish signs the visitor into the Polish demo
    # The point of per-language accounts: a Polish visitor gets Polish DATA,
    # not a Polish shell over English categories.
    When I open the sign-in page as a new visitor
    And I click the demo entry link
    And I choose "Polski" in the demo language picker
    Then I am signed in
    And the URL contains "/pl"

  Scenario: Both demo budgets are present and the aggregate spans two currencies
    When I open the demo entry point
    Then both demo budgets are listed
    And the all-budgets overview renders a total

  Scenario: Restricted actions are blocked on the demo account
    When I open the demo entry point
    And I attempt to invite a member
    Then the action is refused as demo-restricted
