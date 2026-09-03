/**
 * investment-category.ts — /budgets/:budgetId/investment-category route factory (r33).
 *
 * The smart "Investments" spendings category — a single non-deletable, reserve-
 * excluded category pinned first in the grid that tracks how much the family has
 * actually invested. Its planned limit is MANUAL (user-typed via the normal
 * /categories/:id/limits endpoint) or SMART (computed on read in the spendings
 * summary = monthly income − Σ other planned).
 *
 *   GET    /   — { category | null, hasIncome }   (toggle state + smart-gate hint)
 *   POST   /   — ensure (create or reactivate) THE Investments category, pinned first
 *   DELETE /   — turn the feature off: archive it (data preserved, reactivatable)
 *   PATCH  /limit-mode — { mode: 'manual' | 'smart' }; smart requires ≥1 active income
 *
 * Self-contained (no BootedDeps) — instantiates its repos like incomes.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { DrizzleCategoryRepo } from "@budget/budgeting/src/adapters/persistence/category-repo";
import { DrizzleIncomeRepo } from "@budget/budgeting/src/adapters/persistence/income-repo";
import { DrizzleCategoryLimitRepo } from "@budget/budgeting/src/adapters/persistence/category-limit-repo";
import { DrizzleBudgetRepo } from "@budget/tenancy/src/adapters/persistence/workspace-repo";

// Minimal shape of what the DTO reads — avoids exporting the domain class subpath.
interface CategoryLike {
  id: string;
  name: string;
  colorKey: string | null;
  investmentLimitMode: string | null;
}

interface InvestmentCategoryDto {
  id: string;
  name: string;
  colorKey: string | null;
  isInvestment: true;
  investmentLimitMode: string | null;
}

function toDto(c: CategoryLike): InvestmentCategoryDto {
  return {
    id: c.id,
    name: c.name,
    colorKey: c.colorKey ?? null,
    isInvestment: true,
    investmentLimitMode: c.investmentLimitMode ?? null,
  };
}

const ensureSchema = z.object({ name: z.string().min(1).max(120).optional() });
const modeSchema = z.object({ mode: z.enum(["manual", "smart", "none"]) });

/**
 * `recomputeIncomeUnderPlanned` — the own-tx INCOME_UNDER_PLANNED runner that
 * boot wires into the incomes route and set-category-limit.
 *
 * Every mutation here changes what the budget PLANS to spend: the limit mode
 * decides whether the Investments plan is a stored amount, a computed one
 * (income − Σ other planned), or nothing at all; creating the category adds a
 * plan and archiving it removes one. set-category-limit.ts has refreshed the
 * shortfall task on every other planned change since r33 — this route wrote
 * through its repos directly and skipped it, so the forecast showed the
 * deficit and no task said so until the hourly sweep came round.
 *
 * Optional so the route stays usable without it; best-effort, exactly like the
 * incomes route — a failed recompute must never fail the save.
 */
export interface InvestmentCategoryRouteDeps {
  recomputeIncomeUnderPlanned?: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<void>;
}

export function createInvestmentCategoryRoute(
  deps: InvestmentCategoryRouteDeps = {},
) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();
  const categoryRepo = new DrizzleCategoryRepo();
  const incomeRepo = new DrizzleIncomeRepo();
  const limitRepo = new DrizzleCategoryLimitRepo();
  const budgetRepo = new DrizzleBudgetRepo();

  /** Refresh INCOME_UNDER_PLANNED after a change to the plan. Never throws. */
  async function refreshShortfallTask(tenantId: string): Promise<void> {
    // budget_id === tenant_id (v1.1), the same identity every caller here uses.
    await deps
      .recomputeIncomeUnderPlanned?.({
        tenantId,
        budgetId: tenantId,
      })
      .catch(() => undefined);
  }

  /** First day of the current month, UTC — the month an edit carries forward from. */
  function thisMonthStart(): string {
    return `${new Date().toISOString().slice(0, 7)}-01`;
  }

  /**
   * Carry the limit MODE into category_limits.no_limit.
   *
   * 'none' is not a third kind of limit — it is the same no-limit a normal
   * category has, and no_limit is the column the grid's dash, the spendings
   * summary, the reserve engine and the cash-flow forecast all read. Writing it
   * here is what lets every one of them treat the Investments category
   * correctly without knowing it is special.
   *
   * Goes through setLimitForMonth so the change is versioned like any other
   * limit edit (SCD-2, carried forward from this month) rather than rewriting
   * history: past months really did have the limit they had.
   */
  async function syncNoLimit(
    tenantId: string,
    categoryId: string,
    mode: string,
    actorUserId: string,
  ): Promise<void> {
    const monthStart = thisMonthStart();
    const current = (
      await limitRepo.effectiveForMonth(tenantId, tenantId, monthStart)
    ).get(categoryId);
    // Same fallback chain as the normal limits route: the workspace already
    // declared its currency, so the member never picks one here.
    let currency = "USD";
    try {
      const ws = (await budgetRepo.listForUser(actorUserId)).find(
        (b) => b.id === tenantId,
      );
      if (ws?.default_currency) currency = ws.default_currency;
    } catch {
      // best-effort; a wrong fallback only labels a zero amount.
    }
    // no_limit ⇒ amounts 0. Not tidiness — an INVARIANT the cash-flow simulator
    // depends on: it computes each category's daily drip as
    // `budget − spent − bills` with NO no_limit check, so an unbounded category
    // spends nothing only because its stored amount is zero
    // (compute-cashflow-projection.ts, rule 0083). Preserving the member's
    // typed figure here — the first version of this function did, to be kind —
    // left an unbounded category quietly dripping it every month, which is what
    // ate a real budget's 500 zł surplus. Every other no-limit row in the
    // database stores 0; this one was the single exception.
    const unbounded = mode === "none";
    await limitRepo.setLimitForMonth({
      tenantId,
      categoryId,
      monthStart,
      normalAmount: unbounded ? "0" : String(current?.planned ?? 0n),
      normalCurrency: currency,
      cushionAmount: unbounded ? "0" : String(current?.cushion ?? 0n),
      cushionCurrency: currency,
      noLimit: unbounded,
      actorUserId,
      carryForward: true,
    });
  }

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

  async function hasActiveIncome(tenantId: string): Promise<boolean> {
    const rows = await incomeRepo.listActive(tenantId);
    return rows.length > 0;
  }

  // GET / — current state for the settings toggle + the smart-gate hint.
  app.get("/", async (c) => {
    const { tenantId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    try {
      const [cat, hasIncome, exists] = await Promise.all([
        categoryRepo.findInvestmentCategory(tenantId),
        hasActiveIncome(tenantId),
        categoryRepo.hasInvestmentCategory(tenantId),
      ]);
      return c.json(
        { category: cat ? toDto(cat) : null, hasIncome, exists },
        200,
      );
    } catch (e) {
      console.error("[investment-category] get failed", e);
      return c.json({ error: "get_failed" }, 500);
    }
  });

  // POST / — create or reactivate THE Investments category (idempotent).
  app.post("/", async (c) => {
    const { tenantId, userId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const parsed = ensureSchema.safeParse(body ?? {});
    const name = parsed.success
      ? (parsed.data.name ?? "Investments")
      : "Investments";
    try {
      const cat = await categoryRepo.ensureInvestmentCategory(
        tenantId,
        userId,
        name,
      );
      // A brand-new (or reactivated) category defaults to 'none', and the flag
      // the rest of the app reads has to say so — a category with no limit row
      // reads as no_limit=false and shows a number where the dash belongs.
      await syncNoLimit(
        tenantId,
        cat.id,
        cat.investmentLimitMode ?? "none",
        userId,
      );
      await refreshShortfallTask(tenantId);
      return c.json({ category: toDto(cat) }, 201);
    } catch (e) {
      console.error("[investment-category] ensure failed", e);
      return c.json({ error: "ensure_failed" }, 500);
    }
  });

  // DELETE / — turn off: archive (hide everywhere, keep data + reactivatable).
  app.delete("/", async (c) => {
    const { tenantId, userId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    try {
      const cat = await categoryRepo.findInvestmentCategory(tenantId);
      if (!cat) return c.body(null, 204); // already off — idempotent
      await categoryRepo.archive(tenantId, cat.id, userId, { hideAll: true });
      // Archiving takes its plan out of the total, which moves the same number
      // the other two paths move.
      await refreshShortfallTask(tenantId);
      return c.body(null, 204);
    } catch (e) {
      console.error("[investment-category] archive failed", e);
      return c.json({ error: "archive_failed" }, 500);
    }
  });

  // PATCH /limit-mode — smart requires income (else 409 income_required).
  app.patch("/limit-mode", async (c) => {
    const { tenantId, userId } = ctx(c);
    if (!tenantId) return c.json({ error: "no active workspace" }, 403);
    const body = await c.req.json().catch(() => null);
    const parsed = modeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        400,
      );
    }
    const { mode } = parsed.data;
    try {
      const cat = await categoryRepo.findInvestmentCategory(tenantId);
      if (!cat) return c.json({ error: "not_found" }, 404);
      if (mode === "smart" && !(await hasActiveIncome(tenantId))) {
        return c.json({ error: "income_required" }, 409);
      }
      await categoryRepo.setInvestmentLimitMode(tenantId, cat.id, mode, userId);
      await syncNoLimit(tenantId, cat.id, mode, userId);
      await refreshShortfallTask(tenantId);
      const updated = await categoryRepo.findInvestmentCategory(tenantId);
      return c.json({ category: updated ? toDto(updated) : null }, 200);
    } catch (e) {
      console.error("[investment-category] limit-mode failed", e);
      return c.json({ error: "limit_mode_failed" }, 500);
    }
  });

  return app;
}
