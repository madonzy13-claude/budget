// PC-02, PC-15: apps/* see ONLY this surface
export * from "./contracts/api";
export * from "./contracts/events";
export * from "./contracts/factory";
export type { BudgetRepo } from "./ports/budget-repo";
export type { WorkspaceRepo } from "./ports/workspace-repo"; // @deprecated backward-compat shim
export type { MemberShareRepo } from "./ports/member-repo";
// domain/* and adapters/* are NOT re-exported.
