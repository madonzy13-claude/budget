/**
 * Persistence barrel — re-exports for downstream plan consumers.
 * Phase 5 Plan 01 adds category-reserve-adjustments-schema.
 * Plans 02+ extend this barrel as new schemas/repos are added.
 */
export * from "./category-reserve-adjustments-schema";
export { budgetWealthSnapshots } from "./budget-wealth-snapshots-schema";
