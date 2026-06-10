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
  getPreferences,
  upsertPreference,
} from "@budget/platform";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

const prefsSchema = z.object({
  budgetId: z.string().uuid(),
  notificationType: z.enum([
    "RESERVE_TOPUP",
    "CONFIRM_DRAFT",
    "CUSHION_BELOW_TARGET",
  ]),
  enabled: z.boolean(),
});

export function createPushRoute(_deps: BootedDeps) {
  const r = new Hono();

  // POST /push/subscribe — upsert a push subscription
  r.post("/subscribe", zValidator("json", subscribeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const tenantIds: string[] = c.get("tenantIds") ?? [];
    if (tenantIds.length === 0)
      return c.json({ error: "no active workspace" }, 403);

    const body = c.req.valid("json");
    await upsertSubscription({
      tenantId: tenantIds[0],
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
    });
    return c.json({ ok: true });
  });

  // DELETE /push/subscribe — remove a push subscription
  r.delete("/subscribe", zValidator("json", unsubscribeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const delTenantIds: string[] = c.get("tenantIds") ?? [];
    if (delTenantIds.length === 0)
      return c.json({ error: "no active workspace" }, 403);

    const body = c.req.valid("json");
    await deleteSubscription(body.endpoint, delTenantIds[0], session.user.id);
    return c.json({ ok: true });
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
    });
    return c.json({ ok: true });
  });

  return r;
}
