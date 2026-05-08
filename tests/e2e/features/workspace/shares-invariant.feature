Feature: Shares editor sum invariant
  D-06 / TENT-13 enforces that contribution percentages on a SHARED workspace
  sum to exactly 100% (±0.005). Phase 1 implements this as a deferrable
  constraint trigger in tenancy.shared_workspace_member_shares; the editor UI
  in workspace settings is a Phase 2 deliverable. These scenarios pin the
  server-side invariant.

  Scenario: Owner shares of exactly 100 percent are accepted
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "FamilyBudget"
    And I pick the SHARED workspace kind
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page
    When I PUT shares with the sole owner at "100.00"
    Then the shares API responds 200

  Scenario: Sum of shares not equal to 100 is rejected
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "FamilyShared2"
    And I pick the SHARED workspace kind
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page
    When I PUT shares with the sole owner at "50.00"
    Then the shares API responds with a non-2xx status
