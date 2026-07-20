Feature: Combined home page
  # HOME-01 empty-state hero.
  #
  # r35 + Task 16: the multi-budget home listing is no longer a grid of
  # per-budget BudgetCards — a single budget auto-opens its overview, and ≥2
  # budgets render the cross-budget AggregateOverview (covered by
  # budgets-aggregate.feature). Opening a specific budget now goes through the
  # header switcher (covered by nav-switcher.feature: "Selecting a budget routes
  # to its overview tab"). The old "renders one BudgetCard" / "card click
  # navigates" scenarios tested that removed grid and were dropped here.

  Background:
    Given I am signed in as a fresh user

  Scenario: Empty home state shows hero CTA when user has no budgets
    Given I am a signed-in user with no budgets
    When I open the home page
    Then I see the "Create your first budget" CTA
