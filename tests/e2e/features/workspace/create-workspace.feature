Feature: Create workspace

  Scenario: Empty workspaces page shows create CTA for verified user
    Given a fresh verified user in "en"
    When I navigate to "/en/workspaces"
    Then the create-workspace empty CTA is visible

  Scenario: Verified user creates a private workspace and lands on its detail page
    Given a fresh verified user in "en"
    When I navigate to "/en/workspaces"
    And I click the create-workspace empty CTA
    Then the create-workspace form fields are visible
    When I fill workspace name "My Family Budget"
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page

  Scenario Outline: Locale flow shows localized create CTA
    Given a fresh verified user in "<locale>"
    When I navigate to "/<locale>/workspaces"
    Then the create-workspace empty CTA is visible

    Examples:
      | locale |
      | pl     |
      | uk     |
