@mcp
Feature: Connect an AI assistant over MCP (Phase 15)
  # An MCP client registers itself, the user allows it on the consent page,
  # and the client then reads and writes the budget through /mcp with the
  # token it got. Connected apps lists it; Disconnect cuts it off at once.

  Background:
    Given I am signed in as a fresh user

  Scenario Outline: Connect an assistant and add then undo a spending (<locale>)
    Given my budget has a category "Groceries"
    And an MCP client registers and starts authorization in "<locale>"
    Then the consent page names the client and says it covers all budgets in "<locale>"
    When I allow access in "<locale>"
    And the client exchanges the code for tokens
    Then the client lists tools and list_budgets includes my budget
    When the client adds a 12.34 spending to "Groceries"
    Then the 12.34 spending is in my spendings list
    When the client undoes that write
    Then the 12.34 spending is gone from my spendings list

    Examples:
      | locale |
      | en     |
      | pl     |
      | uk     |

  Scenario: Disconnect stops the assistant
    Given an MCP client registers and starts authorization in "en"
    When I allow access in "en"
    And the client exchanges the code for tokens
    And I open Connected apps
    Then I see the client in Connected apps
    When I disconnect the client
    Then the client is gone from Connected apps
    And the next MCP call returns 401

  Scenario: Recording an investment turns Investments on quietly
    Given an MCP client registers and starts authorization in "en"
    When I allow access in "en"
    And the client exchanges the code for tokens
    And the client records buying a new crypto asset "Quiet coin"
    Then "Quiet coin" is on my Wallets tab

  Scenario: A broker account in three currencies, as the user said it
    Given an MCP client registers and starts authorization in "en"
    When I allow access in "en"
    And the client exchanges the code for tokens
    And the client opens broker account "XTB" with 3000 PLN, adds 2000 USD and sets it to 1500000 UAH
    Then "XTB" is on my Wallets tab

  Scenario: The owner sets the cushion and adds an income through the assistant
    Given an MCP client registers and starts authorization in "en"
    When I allow access in "en"
    And the client exchanges the code for tokens
    And the client sets the cushion target to 4.5 months
    And the client adds a monthly income "Salary" of 5000 USD
    Then my Settings show a cushion target of 4.5 months
    And the client lists the income "Salary" at "5000.00" USD

  Scenario: Discovery on the public host
    Then the OAuth discovery documents are served
    And an MCP call without a token returns 401 with a challenge
