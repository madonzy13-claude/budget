/**
 * recurring-rules.ts — /recurring-rules route factory (plan 02-08, EXPN-08)
 *
 * POST   /recurring-rules            — create rule (idempotency middleware)
 * GET    /recurring-rules            — list active rules for tenant
 * PATCH  /recurring-rules/:id        — update rule (REQUIRES applyToFuture; D-01-d)
 * DELETE /recurring-rules/:id        — soft-delete (sets active=false)
 *
 * Idempotency middleware (mounted in app.ts) protects POST/PATCH/DELETE.
 * RLS via tenantGuard middleware (sets app.tenant_ids GUC).
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createRecurringRulesRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /recurring-rules — create
  app.post("/", async (c) => {
    const { createRecurringRuleSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createRecurringRuleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    const r = await deps.budgeting.createRecurringRule({
      ...parsed.data,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string };
      if (e.kind === "FirstDueDateInPast") {
        return c.json({ error: "first_due_in_past", message: e.message }, 422);
      }
      return c.json({ error: e.message }, 422);
    }

    return c.json(r.value, 201);
  });

  // GET /recurring-rules?active=true
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const rules = await deps.budgeting.recurringRuleRepo.listActive(tenantId);
    return c.json({
      rules: rules.map((rule) => ({
        id: rule.id,
        tenantId: rule.tenantId,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        amount: rule.amount,
        currency: rule.currency,
        kind: rule.kind,
        cadence: rule.cadence,
        cadenceAnchor: rule.cadenceAnchor,
        weeklyDow: rule.weeklyDow,
        note: rule.note,
        active: rule.active,
        nextDueDate: rule.nextDueDate,
        createdAt:
          rule.createdAt instanceof Date
            ? rule.createdAt.toISOString()
            : rule.createdAt,
      })),
    });
  });

  // PATCH /recurring-rules/:id — D-01-d: applyToFuture REQUIRED
  app.patch("/:id", async (c) => {
    const { updateRecurringRuleSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const ruleId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = updateRecurringRuleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    const r = await deps.budgeting.updateRecurringRule({
      tenantId,
      ruleId,
      edits: parsed.data.edits,
      applyToFuture: parsed.data.applyToFuture,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string };
      if (e.kind === "RuleNotFound") {
        return c.json({ error: "not_found", message: e.message }, 404);
      }
      return c.json({ error: e.message }, 422);
    }

    return c.json(r.value, 200);
  });

  // DELETE /recurring-rules/:id — soft-delete (active=false)
  app.delete("/:id", async (c) => {
    const ruleId = c.req.param("id");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    const r = await deps.budgeting.deleteRecurringRule({
      tenantId,
      ruleId,
      actorUserId: userId,
    });
    if (r.isErr()) {
      return c.json({ error: r.error.message }, 422);
    }
    return c.body(null, 204);
  });

  return app;
}
