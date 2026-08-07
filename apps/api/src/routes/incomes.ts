/**
 * incomes.ts — /incomes route factory (r32).
 *
 * POST   /incomes         — create an income (name + amount + currency + cadence)
 * GET    /incomes         — list active incomes for the budget
 * PATCH  /incomes/:id     — full update of the editable fields
 * DELETE /incomes/:id     — soft-delete (active = false)
 *
 * Config only for now (no engine/consumption). Cadence mirrors scheduled rules
 * (DAILY/WEEKLY/MONTHLY/YEARLY + anchors) via a discriminated union. Mounted
 * under /budgets/:budgetId/incomes and the legacy root /incomes.
 */
import { Hono } from "hono";
import { z } from "zod";
import { DrizzleIncomeRepo } from "@budget/budgeting/src/adapters/persistence/income-repo";
import type { IncomeCadence } from "@budget/budgeting/src/adapters/persistence/income-repo";

/** Today in UTC, as the API sees it. */
const todayISO = () => new Date().toISOString().slice(0, 10);

const cadenceSpecSchema = z.discriminatedUnion("cadence", [
  // ONCE carries a DATE instead of an anchor, and it may not be in the past:
  // income that has already arrived is a transaction, not a plan (260807).
  z.object({
    cadence: z.literal("ONCE"),
    once_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((d) => d >= todayISO(), "once_date must not be in the past"),
  }),
  z.object({ cadence: z.literal("DAILY") }),
  z.object({
    cadence: z.literal("WEEKLY"),
    weekly_dow: z.number().int().min(0).max(6),
  }),
  z.object({
    cadence: z.literal("MONTHLY"),
    cadence_anchor: z.number().int().min(1).max(31),
  }),
  z.object({
    cadence: z.literal("YEARLY"),
    yearly_month: z.number().int().min(1).max(12),
    cadence_anchor: z.number().int().min(1).max(31),
  }),
]);

const baseFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((v) => parseFloat(v) > 0, "amount must be positive"),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
});

const incomeSchema = z.intersection(baseFieldsSchema, cadenceSpecSchema);

type IncomeInput = z.infer<typeof baseFieldsSchema> & {
  cadence: IncomeCadence;
  weekly_dow?: number;
  cadence_anchor?: number;
  yearly_month?: number;
  once_date?: string;
};

/** Derive the (nullable) anchor columns from the discriminated cadence. */
function anchors(d: IncomeInput) {
  return {
    cadenceAnchor:
      d.cadence === "MONTHLY" || d.cadence === "YEARLY"
        ? (d.cadence_anchor ?? null)
        : null,
    weeklyDow: d.cadence === "WEEKLY" ? (d.weekly_dow ?? null) : null,
    yearlyMonth: d.cadence === "YEARLY" ? (d.yearly_month ?? null) : null,
    // Null for every rhythm: a date on a monthly income would be a second,
    // contradictory answer to "when" (the DB CHECK says the same).
    onceDate: d.cadence === "ONCE" ? (d.once_date ?? null) : null,
  };
}

interface IncomeDto {
  id: string;
  name: string;
  amount: string;
  currency: string;
  cadence: IncomeCadence;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  /** The day a ONE-TIME income arrives; null for the rhythms. */
  onceDate: string | null;
}

/**
 * A date belongs to a ONE-TIME income and to nothing else. Zod strips the key
 * off a rhythm rather than complaining, so the contradiction is caught here —
 * silently dropping it would tell a client its date was accepted (260807).
 */
function dateOnARhythm(body: unknown): boolean {
  const b = body as { cadence?: unknown; once_date?: unknown };
  return b?.once_date != null && b?.cadence !== "ONCE";
}

export function createIncomesRoute(deps?: {
  /** r33: refresh the INCOME_UNDER_PLANNED task after an income change (own tx). */
  recomputeIncomeUnderPlanned?: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<void>;
}) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();
  const repo = new DrizzleIncomeRepo();
  // v1.1 invariant budgetId === tenantId; income is tenant-scoped.
  const refreshTask = (tenantId: string) =>
    deps?.recomputeIncomeUnderPlanned?.({ tenantId, budgetId: tenantId });

  function ctx(c: { get: (k: string) => unknown }): {
    tenantId: string;
    userId: string;
  } {
    const ids = c.get("tenantIds") as string[] | undefined;
    const session = c.get("session") as { user?: { id?: string } } | undefined;
    return {
      tenantId: ids?.[0] ?? "",
      userId: (c.get("userId") as string) ?? session?.user?.id ?? "",
    };
  }

  // POST /incomes — create
  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);
    if (dateOnARhythm(body))
      return c.json({ error: "once_date_on_recurring_income" }, 400);
    const parsed = incomeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        400,
      );
    }
    const { tenantId, userId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    const d = parsed.data as IncomeInput;
    try {
      const { id } = await repo.insert({
        tenantId,
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        cadence: d.cadence,
        ...anchors(d),
        actorUserId: userId,
      });
      await refreshTask(tenantId);
      const dto: IncomeDto = {
        id,
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        cadence: d.cadence,
        ...anchors(d),
      };
      return c.json(dto, 201);
    } catch (e) {
      console.error("[incomes] create failed", e);
      return c.json({ error: "create_failed" }, 500);
    }
  });

  // GET /incomes — list active
  app.get("/", async (c) => {
    const { tenantId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    try {
      const rows = await repo.listActive(tenantId);
      const incomes: IncomeDto[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        amount: r.amount,
        currency: r.currency,
        cadence: r.cadence,
        cadenceAnchor: r.cadenceAnchor,
        weeklyDow: r.weeklyDow,
        yearlyMonth: r.yearlyMonth,
        onceDate: r.onceDate,
      }));
      return c.json({ incomes }, 200);
    } catch (e) {
      console.error("[incomes] list failed", e);
      return c.json({ error: "list_failed" }, 500);
    }
  });

  // PATCH /incomes/:id — full update
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "bad id" }, 400);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);
    if (dateOnARhythm(body))
      return c.json({ error: "once_date_on_recurring_income" }, 400);
    const parsed = incomeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        400,
      );
    }
    const { tenantId, userId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    const d = parsed.data as IncomeInput;
    try {
      const { updated } = await repo.update(id, {
        tenantId,
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        cadence: d.cadence,
        ...anchors(d),
        actorUserId: userId,
      });
      if (!updated) return c.json({ error: "not_found" }, 404);
      await refreshTask(tenantId);
      const dto: IncomeDto = {
        id,
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        cadence: d.cadence,
        ...anchors(d),
      };
      return c.json(dto, 200);
    } catch (e) {
      console.error("[incomes] update failed", e);
      return c.json({ error: "update_failed" }, 500);
    }
  });

  // DELETE /incomes/:id — soft-delete
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "bad id" }, 400);
    const { tenantId, userId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    try {
      await repo.deactivate(tenantId, id, userId);
      await refreshTask(tenantId);
      return c.body(null, 204);
    } catch (e) {
      console.error("[incomes] delete failed", e);
      return c.json({ error: "delete_failed" }, 500);
    }
  });

  return app;
}
