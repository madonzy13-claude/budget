/**
 * workspace-fetch.ts — DEPRECATED shim. All code has migrated to budget-fetch.ts.
 * Re-exports for backward compatibility during transition; will be removed in Phase 2.
 */
export {
  extractBudgetIdFromPath as extractWorkspaceIdFromPath,
  clientApiFetch,
} from "@/lib/budget-fetch";
