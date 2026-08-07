@possessions-wallet
Feature: Possession and other-asset wallets — always-on sections, add, move, persist

  # 260803: possessions stopped being holdings and became wallets, and OTHER
  # arrived beside them for assets that belong to nothing in particular. Both
  # are ordinary wallet sections: always on, inline add, draggable to any other
  # section. Capitalization/retirement maths is unit-tested.

  Background:
    Given I am signed in as a fresh user

  Scenario: The possession and other sections are always visible on the wallets tab
    When I open the wallets tab for wallet sections
    Then I see the "POSSESSION" wallet section
    And I see the "OTHER" wallet section

  Scenario: Add a possession persists via the inline add row
    When I open the wallets tab for wallet sections
    And I add a wallet "Family car" to the "POSSESSION" section
    Then the wallet "Family car" is in the "POSSESSION" section
    And the wallet "Family car" is still in the "POSSESSION" section after a reload

  Scenario: Add an other asset persists via the inline add row
    When I open the wallets tab for wallet sections
    And I add a wallet "Gift cards" to the "OTHER" section
    Then the wallet "Gift cards" is in the "OTHER" section
    And the wallet "Gift cards" is still in the "OTHER" section after a reload

  Scenario: A possession can be moved into another section
    When I open the wallets tab for wallet sections
    And I add a wallet "Old bike" to the "POSSESSION" section
    And I move the wallet "Old bike" to the "OTHER" section
    Then the wallet "Old bike" is in the "OTHER" section
    And the wallet "Old bike" is still in the "OTHER" section after a reload
