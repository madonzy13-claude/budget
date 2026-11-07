@settings-investments
Feature: Investments switch in budget Settings (15-18)
  # Settings → Investments holds one switch. The special "Investments" spending
  # category it used to offer is gone, so turning Investments on shows the
  # Wallets section and adds no spending column.

  Background:
    Given I am signed in as a fresh user

  Scenario: Turning Investments on shows them and adds no spending category
    When I open the Investments section of budget Settings
    Then it offers only the Investments on/off switch
    When I turn Investments on
    Then the Investments section is on my Wallets tab
    And my Spendings have no "Investments" column
