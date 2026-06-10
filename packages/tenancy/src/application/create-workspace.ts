/**
 * create-workspace.ts — Backward-compat shim (Plan 01-02 rename to create-budget.ts).
 * Also provides workspaceId alias for test compat during Plan 01-03 migration period.
 * @deprecated use createBudget from create-budget.ts
 */
import { ok, err, type Result } from "@budget/shared-kernel";
export { createBudget } from "./create-budget";
export type { CreateBudgetInput as CreateWorkspaceInput } from "./create-budget";

// Internal type alias — tenancy does NOT import adapters from identity (dep-cruiser).
type BetterAuthApi = {
  api: {
    createOrganization: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ id: string }>;
  };
};

export interface CreateWorkspaceInputLegacy {
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  ownerUserId: string;
}

/** @deprecated use createBudget */
export async function createWorkspace(
  deps: { auth: BetterAuthApi },
  input: CreateWorkspaceInputLegacy,
): Promise<Result<{ workspaceId: string; budgetId: string }, Error>> {
  const { createBudget } = await import("./create-budget");
  const r = await createBudget(deps, input);
  if (r.isErr()) return err(r.error);
  return ok({ workspaceId: r.value.budgetId, budgetId: r.value.budgetId });
}
