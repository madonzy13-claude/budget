import { pgSchema } from "drizzle-orm/pg-core";

export const identity = pgSchema("identity");
export const tenancy = pgSchema("tenancy");
export const sharedKernel = pgSchema("shared_kernel");
export const comparison = pgSchema("comparison");
// PC-05 resolved: expense_ledger primitive ships here in Phase 1;
// full Budgeting context (categories, periods, limits, etc.) lands in Phase 2.
export const budgeting = pgSchema("budgeting");
