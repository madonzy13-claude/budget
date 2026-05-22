/**
 * budget-identity.ts — PATCH /budgets/:id (identity + cushion) route factory
 *
 * SETT-02: name rename + currency change (locked after first transaction)
 * SETT-03: cushion_mode_enabled toggle (single write path via toggleBudgetMode,
 *           which syncs both the boolean and SCD-2 history in one tx — T-06-02-03)
 *
 * Also extends GET /budgets/:id with hasTransactions via the parent budgets router.
 * This file provides a SUB-ROUTER for budget identity mutations only.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";

const patchBudgetSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  default_currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  cushion_mode_enabled: z.boolean().optional(),
});

export function budgetIdentityRoutesFactory(
  deps: Pick<BootedDeps, "tenancy" | "identity"> & {
    budgeting?: Pick<BootedDeps["budgeting"], "toggleBudgetMode">;
  },
) {
  const r = new Hono();

  // GET /budgets/:id — extended to include hasTransactions signal (SETT-02 currency lock)
  // NOTE: This handler is mounted as a sub-router into budgets.ts via r.route("/", ...)
  // The parent GET /:id in budgets.ts is registered FIRST and takes precedence for
  // production traffic. This handler exists so the identity test suite can test the
  // full contract (PATCH + GET hasTransactions) in isolation using only this factory.
  r.get("/:id", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const budget = await deps.tenancy.workspaceRepo.findById(budgetId);
    if (!budget) return c.json({ error: "not_found" }, 404);

    const hasTransactions =
      await deps.tenancy.workspaceRepo.hasTransactions(budgetId);

    return c.json({
      id: budget.id,
      name: budget.name,
      slug: budget.slug,
      kind: budget.kind,
      defaultCurrency: budget.default_currency,
      ownerUserId: budget.ownerUserId,
      memberCount: budget.memberCount,
      cushionModeEnabled: budget.cushionModeEnabled ?? false,
      reservesEnabled: budget.reservesEnabled ?? true,
      hasTransactions,
    });
  });

  // PATCH /budgets/:id — rename, currency change (first-tx lock), cushion toggle
  // T-06-02-02: tenantIds gate → 404 (no existence leak)
  // T-06-02-01: server-side hasTransactions check → 409 for currency change
  r.patch("/:id", zValidator("json", patchBudgetSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const body = c.req.valid("json");
    const actorUserId = (session as { user: { id: string } }).user.id;

    // T-06-02-01: currency lock — reject if budget already has transactions
    if (body.default_currency !== undefined) {
      const hasTx = await deps.tenancy.workspaceRepo.hasTransactions(budgetId);
      if (hasTx) {
        return c.json({ error: "currency_locked" }, 409);
      }
    }

    // Apply name / currency identity patch
    if (body.name !== undefined || body.default_currency !== undefined) {
      try {
        await deps.tenancy.workspaceRepo.updateIdentity(
          budgetId,
          {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.default_currency !== undefined
              ? { defaultCurrency: body.default_currency }
              : {}),
          },
          actorUserId,
        );
      } catch (e: unknown) {
        const msg = (e as Error).message ?? "unknown";
        // Surface DB constraint / trigger errors (e.g. immutability trigger) as 409
        if (/immutable|locked|constraint/i.test(msg)) {
          return c.json({ error: "currency_locked" }, 409);
        }
        console.error("[budget-identity] updateIdentity failed:", msg);
        return c.json({ error: msg }, 422);
      }
    }

    // Cushion toggle: single write path — toggleBudgetMode syncs boolean + SCD-2 history
    if (body.cushion_mode_enabled !== undefined && deps.budgeting) {
      const mode = body.cushion_mode_enabled ? "CUSHION" : "NORMAL";
      const result = await deps.budgeting.toggleBudgetMode({
        tenantId: budgetId,
        workspaceId: budgetId,
        mode,
        actorUserId,
      });
      if (result.isErr()) {
        return c.json({ error: result.error.message }, 422);
      }
    }

    return c.json({ ok: true }, 200);
  });

  return r;
}
