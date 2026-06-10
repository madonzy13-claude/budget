@tasks-redesign @reserves-golden
Feature: A reserve adjust never covers a closed month's overspent

  Setting a reserve THIS month must not retroactively cover a PAST (closed)
  month's overspend — the past overspend stays put and the whole raise lands in
  Available (no cover popup). A past month changes ONLY when its own transaction
  is added/edited (see "back-dated transaction draws the current reserve pool").
  Driven on the real clock so "last month" is genuinely closed.

  Scenario: setting a reserve this month leaves last month's overspend uncovered
    Given I am signed in as a fresh user with workspace "Closed"
    And the category "Fuel" overspent 50 last month with a zero limit
    When I set the "Fuel" reserve to "30" on the reserves tab
    Then no reserve cover popup appears
    And the "Fuel" available reserve shows "30"
    And viewing last month "Fuel" shows overspent "50" and reserves-used "0"

  # The adjust covers THIS month's overspend (cover popup) while last month — also
  # overspent — stays locked. Coverage is attributed per-month: this month gets the
  # cover, last month is untouched.
  Scenario: setting a reserve covers this month's overspend but not last month's
    Given I am signed in as a fresh user with workspace "Closed"
    And the category "Fuel" overspent 50 last month with a zero limit
    And the category "Fuel" also overspent 30 this month
    When I set the "Fuel" reserve to "20" and acknowledge the cover popup
    Then the "Fuel" available reserve shows "0"
    And this month "Fuel" shows overspent "10" and reserves-used "20"
    And viewing last month "Fuel" shows overspent "50" and reserves-used "0"
