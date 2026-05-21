Feature: Budget shares editor sum-100 invariant (D-06 / TENT-13)
  Phase 1 implemented sum-100 as a deferrable DB constraint trigger; the editor UI
  is a Phase 6 deliverable. These scenarios pin the server-side invariant only.

  Scenario: Owner shares of exactly 100 percent are accepted
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "FamilyBudget"
    And I pick the SHARED workspace kind
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a budget detail page
    When I PUT budget shares with the sole owner at "100.00"
    Then the shares API responds 200

  Scenario: Sum of shares not equal to 100 is rejected
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "FamilyShared2"
    And I pick the SHARED workspace kind
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a budget detail page
    When I PUT budget shares with the sole owner at "50.00"
    Then the shares API responds with a non-2xx status
