@skip-phase-05-debt
Feature: Invite member to a budget
  Phase 1 wired Better Auth org-plugin invitations + invite email delivery; the
  "Invite member" UI inside budget settings is Phase 6. These scenarios pin the
  API + email-delivery contract that the future UI will drive.

  Kind removal: private/shared is no longer a stored budget property — any budget
  an owner controls accepts invitations, so there is no budget-kind picker and no
  PRIVATE-reject path. The API-level contract (single-member budget → 201, and the
  ownership guard) is covered by apps/api/test/routes/budget-invitations.test.ts.
  Remains @skip-phase-05-debt until the Phase-6 invite UI + page objects land.

  Scenario: Owner invites a new email to a budget
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "Family"
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a budget detail page
    When I post a budget invitation for "invitee-{ts}@example.com" with role "member"
    Then the invite API responds 201 with an invitation id
    And a Mailpit message is delivered to that invitee email
    And one budget_invitations row exists for that invitee email

  Scenario: A single-member budget also accepts invitations (kind removal)
    Given a fresh verified user in "en"
    When I navigate to "/en/onboarding"
    And I fill workspace name "Solo"
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a budget detail page
    When I post a budget invitation for "invited-{ts}@example.com" with role "member"
    Then the invite API responds 201 with an invitation id
    And one budget_invitations row exists for that invitee email
