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
  // ONBD: Reserves toggle. Plain boolean — no SCD-2 history (unlike cushion mode).
  // Server still owner-gates the write via the same path as name/currency.
  reserves_enabled: z.boolean().optional(),
  // ONBD: Cushion FEATURE toggle. Plain boolean — gates whether the cushion
  // lane is exposed in the UI at all. Distinct from cushion_mode_enabled
  // which tracks per-month cushion-vs-normal state via SCD-2 history.
  cushion_enabled: z.boolean().optional(),
  // Phase 7 Plan 07-07 (D-PH7-15, D-PH7-33) + UAT round 7: cushion target
  // months multiplier. Defense in depth: Zod 1..60 here + DB CHECK
  // constraint (1..60) via migration 0026. Migration 0027 promotes the DB
  // column to numeric(4,1), so fractional months (e.g. 4.5) are now
  // permitted — the .int() guard is dropped. Mutating this field triggers
  // recomputeCushionTask after the identity update.
  cushion_target_months: z.number().min(1).max(60).optional(),
});

export function budgetIdentityRoutesFactory(
  deps: Pick<BootedDeps, "tenancy" | "identity"> & {
    budgeting?: Pick<BootedDeps["budgeting"], "toggleBudgetMode"> & {
      // Phase 7 Plan 07-07: optional runner — if absent the PATCH still works
      // (recompute is best-effort; hourly sweep is the backstop).
      recomputeCushionTaskRunner?: (input: {
        tenantId: string;
        budgetId: string;
      }) => Promise<void>;
    };
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

    // Same caller-role surfacing as parent GET /:id, keeping the two response
    // shapes in lockstep so the test-isolation factory and production handler
    // return the same fields.
    const actorUserId = (session as { user: { id: string } }).user.id;
    let currentUserRole: "owner" | "member" = "member";
    try {
      const members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
      const me = members.find((m) => m.userId === actorUserId);
      if (me) currentUserRole = me.role;
    } catch (e) {
      console.error("[budget-identity:get] listMembers failed:", e);
    }

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
      cushionEnabled: budget.cushionEnabled ?? true,
      hasTransactions,
      currentUserRole,
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

    // T-06-02-00: owner-only gate — non-owner members may not mutate budget identity
    let patchMembers: { userId: string; role: string }[];
    try {
      patchMembers = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    } catch (e) {
      console.error("[budget-identity] listMembers failed:", e);
      return c.json({ error: "internal" }, 500);
    }
    const callerEntry = patchMembers.find((m) => m.userId === actorUserId);
    if (!callerEntry) return c.json({ error: "not_found" }, 404);
    if (callerEntry.role !== "owner")
      return c.json({ error: "forbidden" }, 403);

    // T-06-02-01: currency lock — reject if budget already has transactions
    if (body.default_currency !== undefined) {
      const hasTx = await deps.tenancy.workspaceRepo.hasTransactions(budgetId);
      if (hasTx) {
        return c.json({ error: "currency_locked" }, 409);
      }
    }

    // Apply name / currency / reserves / cushion-feature / cushion_target_months identity patch
    if (
      body.name !== undefined ||
      body.default_currency !== undefined ||
      body.reserves_enabled !== undefined ||
      body.cushion_enabled !== undefined ||
      body.cushion_target_months !== undefined
    ) {
      try {
        await deps.tenancy.workspaceRepo.updateIdentity(
          budgetId,
          {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.default_currency !== undefined
              ? { defaultCurrency: body.default_currency }
              : {}),
            ...(body.reserves_enabled !== undefined
              ? { reservesEnabled: body.reserves_enabled }
              : {}),
            ...(body.cushion_enabled !== undefined
              ? { cushionEnabled: body.cushion_enabled }
              : {}),
            ...(body.cushion_target_months !== undefined
              ? { cushionTargetMonths: body.cushion_target_months }
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
        return c.json({ error: "update_failed" }, 422);
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

    // Phase 7 Plan 07-07 (D-PH7-19, TASK-06): cushion-affecting fields trigger
    // recomputeCushionTask AFTER the identity update lands. The runner opens a
    // SEPARATE withTenantTx (A2 fallback — see archive-wallet.ts pattern).
    //
    // Decision tree handled inside recomputeCushionTask:
    //   - cushion_enabled=false → summary.enabled=false → resolveByKindAndBudget
    //     auto-resolves any PENDING CUSHION_BELOW_TARGET task IN THIS REQUEST
    //     (TASK-06 inline-resolve invariant: cushion_enabled=false MUST clear
    //     the open task before the 200 response — sweep is NOT the only path).
    //   - cushion_target_months ↑ → shortfall grows → emit (or no-op if already
    //     pending).
    //   - cushion_target_months ↓ → shortfall may close → resolve.
    //
    // Best-effort: failure does not fail the PATCH (hourly sweep is backstop).
    const isCushionAffecting =
      body.cushion_enabled !== undefined ||
      body.cushion_target_months !== undefined;
    if (isCushionAffecting && deps.budgeting?.recomputeCushionTaskRunner) {
      try {
        await deps.budgeting.recomputeCushionTaskRunner({
          tenantId: budgetId,
          budgetId,
        });
      } catch (e) {
        console.error("[budget-identity] cushion recompute failed:", e);
        // Do not fail the PATCH — hourly sweep catches missed recomputes.
      }
    }

    return c.json({ ok: true }, 200);
  });

  return r;
}
