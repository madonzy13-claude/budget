@skip-phase-05-debt
Feature: Category contribution share overrides — sum-100 invariant (BDGT-08)
  Per D-06 / TENT-13: per-category contribution percentages must sum to exactly
  100% (±0.005). The category-share-overrides editor UI is a future deliverable;
  these scenarios pin the API + DB invariant the editor will drive.

  Background:
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Rent" with planned "0.00" "EUR"

  Scenario: Sum of overrides equal to 100 is accepted
    When I PUT category share overrides for "Rent" with shares summing to 100
    Then the share-overrides API responds 200

  Scenario: Sum of overrides not equal to 100 is rejected
    When I PUT category share overrides for "Rent" with shares summing to 90
    Then the share-overrides API responds with a non-2xx status
