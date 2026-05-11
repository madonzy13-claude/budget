@phase2
Feature: Account grouping by Assets vs Liabilities

  Plan 02-04 ACCT-01: accounts grouped on the Accounts page by Assets (cash,
  checking, savings, investment) vs Liabilities (credit_card, loan).

  Scenario: Credit card account appears under Liabilities
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Accounts page
    And I click "Add account"
    And I fill the account form with name "Visa Gold", kind "CREDIT_CARD", scope "PERSONAL", currency "USD"
    And I save the account
    Then I see "Visa Gold" in the Accounts list under "Liabilities"

  Scenario: Loan account appears under Liabilities
    Given I am signed in as a fresh user with workspace "Family"
    When I open the Accounts page
    And I click "Add account"
    And I fill the account form with name "Mortgage", kind "LOAN", scope "SHARED", currency "EUR"
    And I save the account
    Then I see "Mortgage" in the Accounts list under "Liabilities"
