@phase6
Feature: Onboarding Wizard — 4-step deferred-create flow (ONBD-01..09)

  Scenario: Fresh user walks all four steps and lands on spendings tab
    Given I am a fresh user with no prior budget
    When I navigate to the onboarding wizard
    And I click Get started
    And I pick the budget type "personal"
    And I click Next
    And I fill in the budget name "Family Budget"
    And I pick the currency "EUR"
    And I click Next
    And I click Next
    Then I see the review step
    And the review shows budget name "Family Budget"
    When I click Create budget
    Then I land on the budget spendings page

  Scenario: Fresh user enables cushion and disables reserves on the features step
    Given I am a fresh user with no prior budget
    When I navigate to the onboarding wizard
    And I click Get started
    And I pick the budget type "personal"
    And I click Next
    And I fill in the budget name "Cushion Budget"
    And I pick the currency "USD"
    And I click Next
    And I toggle the cushion feature off
    And I toggle the reserves feature off
    And I click Next
    Then the review shows cushion as "Disabled"
    And the review shows reserves as "Disabled"
    When I click Create budget
    Then I land on the budget spendings page

  Scenario: Wizard restarts at welcome on mid-wizard reload
    Given I am a fresh user with no prior budget
    When I navigate to the onboarding wizard
    And I click Get started
    And I pick the budget type "personal"
    And I click Next
    And I fill in the budget name "Resumable Budget"
    And I reload the page
    Then the wizard is on the welcome step
