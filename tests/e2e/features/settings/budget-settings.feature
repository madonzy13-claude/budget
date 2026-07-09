@phase6
Feature: Budget Settings — identity autosave, cushion toggle, share link, danger zone (SETT-01..09)

  Scenario: Owner renames the budget and the new name persists after reload
    Given I am signed in as a fresh user with workspace "My Budget"
    When I open the Budget Settings page for my budget
    And I rename the budget to "Renamed Budget"
    Then I see a toast matching "name saved"
    When I reload the Budget Settings page
    Then the budget name input shows "Renamed Budget"

  Scenario: Owner toggles cushion mode on and the state persists after reload
    Given I am signed in as a fresh user with workspace "Cushion Test"
    When I open the Budget Settings page for my budget
    And I open the Cushion Mode section
    And I toggle the cushion switch
    Then I see a toast matching "cushion mode on"
    When I reload the Budget Settings page
    And I open the Cushion Mode section
    Then the cushion switch is checked

  Scenario: Owner generates a share link and sees the URL field with a Copy button
    Given I am signed in as a fresh user with a shared budget "Share Test"
    When I open the Budget Settings page for my budget
    And I open the Members section
    And I click "Generate share link"
    Then the share URL field is visible
    And the copy link button is visible

  Scenario: Owner archives the budget and it disappears from the home grid
    Given I am signed in as a fresh user with workspace "Archive Me"
    When I open the Budget Settings page for my budget
    And I open the Danger Zone section
    And I archive the budget
    Then I am on the home page
    And the budget "Archive Me" is not visible in the home grid

  Scenario: Owner deletes the budget — button disabled until name matches exactly
    Given I am signed in as a fresh user with workspace "Delete Me"
    When I open the Budget Settings page for my budget
    And I open the Danger Zone section
    And I open the delete budget dialog
    Then the Delete forever button is disabled
    When I type the budget name "Delete Me" in the confirm input
    Then the Delete forever button is enabled
    When I confirm the budget deletion
    Then I am on the home page
