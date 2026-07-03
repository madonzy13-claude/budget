Feature: Combined home page
  # Covers HOME-01 (one card per budget), HOME-03 (card click -> spendings),
  # plus empty-state HOME-01.
  # HOME-04 (placeholder chart) scenario removed in Phase 6 UAT — the
  # "Insights coming soon" placeholder card was dropped because it sat at
  # the page bottom and read as a footer once SiteFooter was removed. The
  # real chart (with reinstated visibility check) lands in Phase 8.

  Background:
    Given I am signed in as a fresh user

  Scenario: Home renders one BudgetCard per accessible budget
    When I open the home page
    Then I see a budget card titled "My E2E Budget"

  Scenario: Card click navigates to /budgets/[id]/overview
    When I open the home page
    And I click the card for "My E2E Budget"
    Then the URL ends with "/overview"

  Scenario: Empty home state shows hero CTA when user has no budgets
    Given I am a signed-in user with no budgets
    When I open the home page
    Then I see the "Create your first budget" CTA
