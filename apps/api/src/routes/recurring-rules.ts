/**
 * recurring-rules.ts — /recurring-rules route factory (plan 02-02, RECR-01)
 *
 * POST   /recurring-rules            — create rule (discriminated cadence union)
 * GET    /recurring-rules            — list active rules for tenant
 * PATCH  /recurring-rules/:id        — update rule (REQUIRES applyToFuture; D-01-d)
 * DELETE /recurring-rules/:id        — soft-delete (sets active=false)
 *
 * v1.1 changes (Plan 02-02):
 *   - Cadence extended to DAILY|WEEKLY|MONTHLY|YEARLY with per-cadence Zod validation
 *   - kind field removed (all rules produce SPENDING drafts per D-PH2-09)
 *   - accountId/walletId removed (categorical-only per TXN-02)
 *   - yearly_month exposed in response
 */
import { Hono } from "hono";
import { z } from "zod";
import type { BootedDeps } from "../boot";

// Re-export discriminated union from contracts for route use
const cadenceSpecSchema = z.discriminatedUnion("cadence", [
  z.object({ cadence: z.literal("DAILY") }),
  z.object({ cadence: z.literal("WEEKLY"), weekly_dow: z.number().int().min(0).max(6) }),
  z.object({ cadence: z.literal("MONTHLY"), cadence_anchor: z.number().int().min(1).max(31) }),
  z.object({
    cadence: z.literal("YEARLY"),
    yearly_month: z.number().int().min(1).max(12),
    cadence_anchor: z.number().int().min(1).max(31),
  }),
]);

const createRuleBaseSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((v) => parseFloat(v) > 0, "amount must be positive"),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  note: z.string().max(500).nullable().optional(),
  first_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createRuleSchema = z.intersection(createRuleBaseSchema, cadenceSpecSchema);

const updateRuleEditsSchema = z
  .object({
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .refine((v) => parseFloat(v) > 0, "amount must be positive")
      .optional(),
    currency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

const updateRuleSchema = z.object({
  edits: updateRuleEditsSchema,
  applyToFuture: z.boolean(),
});

export function createRecurringRulesRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // POST /recurring-rules — create
  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        400,
      );
    }

    const data = parsed.data;
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    // Map snake_case API fields to camelCase application input
    const r = await deps.budgeting.createRecurringRule({
      tenantId,
      actorUserId: userId,
      categoryId: (data as any).category_id ?? null,
      amount: data.amount,
      currency: data.currency,
      cadence: data.cadence as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
      cadenceAnchor: (data as any).cadence_anchor ?? null,
      weeklyDow: (data as any).weekly_dow ?? null,
      yearlyMonth: (data as any).yearly_month ?? null,
      note: data.note ?? null,
      firstDueDate: (data as any).first_due_date,
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
        categoryId: rule.categoryId,
        amount: rule.amount,
        currency: rule.currency,
        cadence: rule.cadence,
        cadenceAnchor: rule.cadenceAnchor,
        weeklyDow: rule.weeklyDow,
        yearlyMonth: rule.yearlyMonth,
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
    const ruleId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = updateRuleSchema.safeParse(body);
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
