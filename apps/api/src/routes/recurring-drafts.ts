/**
 * recurring-drafts.ts — /recurring-drafts route factory (plan 02-08, EXPN-08)
 *
 * GET  /recurring-drafts?status=PENDING — list pending drafts for tenant
 * POST /recurring-drafts/:id/confirm     — confirm → creates ledger row + marks CONFIRMED
 * POST /recurring-drafts/:id/edit-confirm — edit + confirm in one tx
 * POST /recurring-drafts/:id/skip        — mark SKIPPED, no ledger row
 *
 * All mutating endpoints carry idempotency middleware (mounted in app.ts).
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createRecurringDraftsRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // GET /recurring-drafts — list pending
  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const r = await deps.budgeting.listPendingDrafts({
      tenantId,
      includeOverdue: true,
    });
    if (r.isErr()) return c.json({ error: r.error.message }, 500);
    return c.json({
      drafts: r.value.map((d) => ({
        id: d.id,
        tenantId: d.tenantId,
        ruleId: d.ruleId,
        dueDate: d.dueDate,
        amount: d.amount,
        currency: d.currency,
        accountId: d.accountId,
        categoryId: d.categoryId,
        kind: d.kind,
        note: d.note,
        status: d.status,
        createdAt:
          d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
        confirmedAt:
          d.confirmedAt instanceof Date
            ? d.confirmedAt.toISOString()
            : d.confirmedAt,
      })),
    });
  });

  // POST /recurring-drafts/:id/confirm
  app.post("/:id/confirm", async (c) => {
    const draftId = c.req.param("id");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    const r = await deps.budgeting.confirmRecurringDraft({
      tenantId,
      draftId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string };
      if (e.kind === "AlreadyConfirmed") {
        return c.json({ error: "already_confirmed", message: e.message }, 409);
      }
      if (e.kind === "DraftNotFound") {
        return c.json({ error: "not_found", message: e.message }, 404);
      }
      return c.json({ error: e.message }, 422);
    }
    return c.json(r.value, 201);
  });

  // POST /recurring-drafts/:id/edit-confirm
  app.post("/:id/edit-confirm", async (c) => {
    const { editConfirmDraftSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const draftId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = editConfirmDraftSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation error", issues: parsed.error.issues },
        422,
      );
    }

    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    const r = await deps.budgeting.editAndConfirmRecurringDraft({
      tenantId,
      draftId,
      edits: { ...parsed.data.edits, fxPreview: parsed.data.fxPreview ?? null },
      actorUserId: userId,
    });

    if (r.isErr()) {
      const e = r.error as {
        kind?: string;
        message: string;
        freshRate?: unknown;
      };
      if (e.kind === "AlreadyConfirmed") {
        return c.json({ error: "already_confirmed", message: e.message }, 409);
      }
      if (e.kind === "DraftNotFound") {
        return c.json({ error: "not_found", message: e.message }, 404);
      }
      if (e.kind === "FxRateStale") {
        return c.json({ error: "fx_rate_stale", freshRate: e.freshRate }, 409);
      }
      return c.json({ error: e.message }, 422);
    }
    return c.json(r.value, 201);
  });

  // POST /recurring-drafts/:id/skip
  app.post("/:id/skip", async (c) => {
    const draftId = c.req.param("id");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;

    const r = await deps.budgeting.skipRecurringDraft({
      tenantId,
      draftId,
      actorUserId: userId,
    });
    if (r.isErr()) {
      const e = r.error as { kind?: string; message: string };
      if (e.kind === "AlreadyConfirmed") {
        return c.json({ error: "already_confirmed", message: e.message }, 409);
      }
      if (e.kind === "DraftNotFound") {
        return c.json({ error: "not_found", message: e.message }, 404);
      }
      return c.json({ error: e.message }, 422);
    }
    return c.body(null, 204);
  });

  return app;
}
