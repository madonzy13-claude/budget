Feature: Invite member to a SHARED budget
  Phase 1 wired Better Auth org-plugin invitations + invite email delivery for
  SHARED budgets. The "Invite member" UI inside budget settings is Phase 6; these
  scenarios pin the API + email-delivery contract that the future UI will drive.

  Scenario: Owner invites a new email to a SHARED budget
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "Family"
    And I pick the SHARED workspace kind
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a budget detail page
    When I post a budget invitation for "invitee-{ts}@example.com" with role "member"
    Then the invite API responds 201 with an invitation id
    And a Mailpit message is delivered to that invitee email
    And one budget_invitations row exists for that invitee email

  Scenario: PRIVATE budgets reject invitations
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "Solo"
    And I pick the PRIVATE workspace kind
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a budget detail page
    When I post a budget invitation for "rejected-{ts}@example.com" with role "member"
    Then the invite API responds with a non-2xx status
