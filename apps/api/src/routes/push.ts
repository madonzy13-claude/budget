/**
 * push.ts — /push route factory
 * VAPID push subscription management + notification preferences.
 *
 * Plan 08-02 (PWAX-04).
 * Session guard on every state-changing handler; userId from session, never body.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";
import {
  upsertSubscription,
  deleteSubscription,
  isSubscribedForBudget,
  getPreferences,
  upsertPreference,
} from "@budget/platform";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  // 260618: subscriptions are PER-BUDGET. The row is stored under tenant_id =
  // budgetId, so the Settings master switch is per-budget (not device-global).
  budgetId: z.string().uuid(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
  budgetId: z.string().uuid(),
});

const prefsSchema = z.object({
  budgetId: z.string().uuid(),
  notificationType: z.enum([
    "RESERVE_TOPUP",
    "CONFIRM_DRAFT",
    "CUSHION_BELOW_TARGET",
    // r33: income < total planned spending — "review your spendings".
    "INCOME_UNDER_PLANNED",
    // r32: task-completed toggle + budget-update reminder (with day/tz config).
    "TASK_COMPLETED",
    "BUDGET_REMINDER",
    // r37: per-user-per-budget app-icon BADGE opt-out. Not a push notification —
    // controls whether this budget's pending-task count feeds the PWA app badge.
    "BADGE",
  ]),
  enabled: z.boolean(),
  config: z
    .object({
      days: z.array(z.number().int().min(1).max(7)).optional(),
      tz: z.string().min(1).max(64).optional(),
    })
    .nullable()
    .optional(),
});

export function createPushRoute(_deps: BootedDeps) {
  const r = new Hono();

  // POST /push/subscribe — upsert a push subscription FOR A BUDGET.
  // The subscription row is keyed (endpoint, tenant_id=budgetId), so enabling
  // push in one budget never enables it in another (260618 UAT fix).
  r.post("/subscribe", zValidator("json", subscribeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const tenantIds: string[] = c.get("tenantIds") ?? [];
    const body = c.req.valid("json");
    // The caller must be a member of the target budget (its id is a tenant in
    // their session tenant list) — else they could subscribe to others' budgets.
    if (!tenantIds.includes(body.budgetId))
      return c.json({ error: "forbidden budget" }, 403);

    await upsertSubscription({
      tenantId: body.budgetId,
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
    });
    return c.json({ ok: true });
  });

  // DELETE /push/subscribe — remove THIS budget's subscription row (the device
  // endpoint stays subscribed for any other budgets the user enabled).
  r.delete("/subscribe", zValidator("json", unsubscribeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const delTenantIds: string[] = c.get("tenantIds") ?? [];
    const body = c.req.valid("json");
    if (!delTenantIds.includes(body.budgetId))
      return c.json({ error: "forbidden budget" }, 403);

    // deleteSubscription runs under the budget's tenant — RLS scopes the delete
    // to the (endpoint, budgetId) row only.
    await deleteSubscription(body.endpoint, body.budgetId, session.user.id);
    return c.json({ ok: true });
  });

  // GET /push/subscription-status?budgetId=<uuid>&endpoint=<url> — per-budget
  // master state for the Settings switch: is THIS device endpoint subscribed for
  // THIS budget? (Replaces the old device-global getSubscription() heuristic.)
  r.get("/subscription-status", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.query("budgetId");
    const endpoint = c.req.query("endpoint");
    if (!budgetId || !/^[0-9a-f-]{36}$/.test(budgetId)) {
      return c.json({ error: "budgetId query param required (UUID)" }, 400);
    }

    const tenantIds: string[] = c.get("tenantIds") ?? [];
    if (!tenantIds.includes(budgetId))
      return c.json({ error: "forbidden budget" }, 403);

    if (!endpoint) return c.json({ subscribed: false });
    const subscribed = await isSubscribedForBudget(
      budgetId,
      session.user.id,
      endpoint,
    );
    return c.json({ subscribed });
  });

  // GET /push/preferences?budgetId=<uuid> — fetch 3-kind toggles for a budget
  r.get("/preferences", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.query("budgetId");
    if (!budgetId || !/^[0-9a-f-]{36}$/.test(budgetId)) {
      return c.json({ error: "budgetId query param required (UUID)" }, 400);
    }

    const tenantIds: string[] = c.get("tenantIds") ?? [];
    if (tenantIds.length === 0)
      return c.json({ error: "no active workspace" }, 403);

    const prefs = await getPreferences(tenantIds[0], session.user.id, budgetId);
    return c.json({ preferences: prefs });
  });

  // PATCH /push/preferences — upsert one preference toggle
  r.patch("/preferences", zValidator("json", prefsSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const tenantIds: string[] = c.get("tenantIds") ?? [];
    if (tenantIds.length === 0)
      return c.json({ error: "no active workspace" }, 403);

    const body = c.req.valid("json");
    await upsertPreference({
      tenantId: tenantIds[0],
      userId: session.user.id,
      budgetId: body.budgetId,
      notificationType: body.notificationType,
      enabled: body.enabled,
      config: body.config ?? undefined,
    });
    return c.json({ ok: true });
  });

  return r;
}
