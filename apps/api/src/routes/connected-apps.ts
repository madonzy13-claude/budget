/**
 * connected-apps.ts — /settings/connected-apps (Phase 15, D-21)
 *
 *   GET    /                    — the caller's MCP connections
 *   GET    /client/:clientId    — public name + redirect hosts (consent screen)
 *   DELETE /:clientId           — disconnect: tokens + consent gone at once
 *
 * Per user, never per budget: a connection spans all the user's budgets (D-01).
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  listConnections,
  disconnect,
  getClientPublicInfo,
} from "@budget/identity";
import type { BootedDeps } from "../boot";

const clientIdSchema = z.string().min(1).max(200);

export function connectedAppsRoutes(_deps: BootedDeps) {
  const r = new Hono();

  r.get("/", async (c) => {
    const userId = c.get("session")!.user.id;
    const rows = await listConnections(userId);
    return c.json({
      connections: rows.map((x) => ({
        client_id: x.clientId,
        client_name: x.clientName,
        scopes: x.scopes.filter((s) => s !== "offline_access"),
        connected_at: new Date(x.connectedAt).toISOString(),
        last_used_at: x.lastUsedAt ? new Date(x.lastUsedAt).toISOString() : null,
      })),
    });
  });

  r.get("/client/:clientId", async (c) => {
    const id = clientIdSchema.safeParse(c.req.param("clientId"));
    if (!id.success) return c.json({ error: "not_found" }, 404);
    const info = await getClientPublicInfo(c.get("session")!.user.id, id.data);
    if (!info) return c.json({ error: "not_found" }, 404);
    return c.json({
      client_id: info.clientId,
      client_name: info.name,
      redirect_hosts: info.redirectHosts,
    });
  });

  r.delete("/:clientId", async (c) => {
    const id = clientIdSchema.safeParse(c.req.param("clientId"));
    if (!id.success) return c.json({ error: "invalid_client_id" }, 422);
    await disconnect(c.get("session")!.user.id, id.data);
    return c.body(null, 204);
  });

  return r;
}
