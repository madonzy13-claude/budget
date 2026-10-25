@wallet-section-share
Feature: Wallet section share of all assets on a phone
  # The phone hides the desktop share column, so each section header shows its
  # share of all assets beside the section's name (user, 261024).

  Background:
    Given I am signed in as a fresh user

  Scenario: Each section header shows its share beside its name
    Given I am on a phone-sized viewport
    And a "SPENDINGS" wallet holds 250.00 USD
    And a "CUSHION" wallet holds 750.00 USD
    When I open the wallets tab for wallet sections
    Then the "CUSHION" section header shows "75%" beside its name
    And the "SPENDINGS" section header shows "25%" beside its name
    And the "CUSHION" section total looks like its share

  Scenario: Investments count toward the total and show their own share
    Given I am on a phone-sized viewport
    And investments are enabled for my budget
    And 1 custom holdings exist in my budget
    And a "SPENDINGS" wallet holds 200.00 USD
    And a "CUSHION" wallet holds 300.00 USD
    When I open the wallets tab for wallet sections
    Then the "INVESTMENTS" section header shows "16.7%" beside its name
    And the "SPENDINGS" section header shows "33.3%" beside its name
    And the "CUSHION" section header shows "50%" beside its name
    And the "INVESTMENTS" section total looks like its share
