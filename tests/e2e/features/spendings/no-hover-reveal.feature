@phase4 @skip-phase-05-debt
Feature: Hover does not reveal action chips (D-PH4-INT1 regression guard)

  Scenario: Pointermove over a transaction row leaves DOM in resting state
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
    And the budget "Family" has a transaction "10.00" "PLN" in category "Groceries"
    When I open the Spendings tab on a budget "Family"
    And I move the pointer over the transaction row "10.00" without clicking
    Then I do not see floating action chips on "the transaction row 10.00"

  Scenario: Pointermove over a draft row leaves DOM in resting state
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
    And the budget "Family" has a recurring rule "Rent" for category "Groceries" of "50.00" "PLN" due this month
    When I open the Spendings tab on a budget "Family"
    And I move the pointer over the draft row "Rent" without clicking
    Then I do not see floating action chips on "the draft row Rent"

  Scenario: Pointermove over a column header leaves pen icon hidden
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned "200.00" "PLN"
    When I open the Spendings tab on a budget "Family"
    And I move the pointer over the column header "Groceries" without clicking
    Then I do not see the pen action on column header "Groceries"
