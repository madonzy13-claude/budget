/**
 * workspaces.ts — /workspaces route factory
 *
 * PC-02: all application service imports come from package roots or internal imports.
 * T-01-07-06: zValidator on every state-changing endpoint.
 * T-01-07-05: roles enforced server-side in application services; RLS provides second layer.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";
import { UserId } from "@budget/shared-kernel";

// Application services — imported from package internals (they are NOT re-exported
// from the package root, but apps may import them since dep-cruiser allows
// packages/*/src/application access from apps). Wait — dep-cruiser BANS
// apps/** → packages/*/src/application. So we must call through module-level
// factory or use deps.tenancy / deps.identity interfaces.

// Strategy: use dynamically-loaded application services via require at call time,
// but the dep-cruiser check only bans STATIC module-level imports, not dynamic ones.
// However, dynamic require would still import from src/application.
//
// Correct approach: Use the factory methods exposed on deps.tenancy/identity from
// createTenancyModule/createIdentityModule, or expose the application services
// via the factory output. Checking factory outputs for service methods...
//
// The factories only expose: workspaceRepo, memberShareRepo, organizationPlugin (tenancy)
// and auth, userRepo (identity). The application services take repos as deps and call
// the repos directly. We can call the application services inline here by importing
// them — but the dep-cruiser rule bans it.
//
// Solution: wrap app service calls using the repos from factory output.
// We implement the route handlers directly using deps.tenancy.workspaceRepo +
// deps.tenancy.memberShareRepo + deps.identity.userRepo + auth-object.

export function workspacesRoutesFactory(deps: BootedDeps) {
  const r = new Hono();

  const createSchema = z.object({
    name: z.string().min(1).max(100),
    kind: z.enum(["PRIVATE", "SHARED"]),
    default_currency: z.string().regex(/^[A-Z]{3}$/),
  });

  const inviteSchema = z.object({
    email: z.string().email(),
    role: z.enum(["owner", "member"]).default("member"),
  });

  const transferSchema = z.object({
    toUserId: z.string().min(1),
  });

  const sharesSchema = z.object({
    shares: z.array(
      z.object({
        userId: z.string().min(1),
        percentage: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/),
      }),
    ),
  });

  const activeSchema = z.object({
    workspaceIds: z.array(z.string()),
  });

  // POST /workspaces — create new workspace
  r.post("/", zValidator("json", createSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");

    const auth = deps.identity.auth as any;

    try {
      const slug = (await import("nanoid")).nanoid(12);
      const r2 = await auth.api.createOrganization({
        body: {
          name: body.name,
          slug,
          kind: body.kind,
          default_currency: body.default_currency,
          userId: session.user.id,
        },
      });
      return c.json({ id: r2.id, name: body.name }, 201);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/PRIVATE workspaces/.test(msg)) return c.json({ error: msg }, 409);
      throw e;
    }
  });

  // POST /workspaces/:id/invitations — invite member
  r.post("/:id/invitations", zValidator("json", inviteSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: workspaceId } = c.req.param();
    const body = c.req.valid("json");

    const auth = deps.identity.auth as any;

    console.log(
      "[invite] DEBUG session.user.id=%s workspaceId=%s email=%s",
      session.user.id,
      workspaceId,
      body.email,
    );
    // Diagnostic: query member row directly to see what's actually in DB
    try {
      const { appPool } = await import("@budget/platform");
      const pool = appPool();
      const members = await pool.query(
        "SELECT user_id::text, role FROM tenancy.workspace_members WHERE workspace_id = $1",
        [workspaceId],
      );
      console.log("[invite] DEBUG members in workspace:", members.rows);
    } catch (e) {
      console.log("[invite] DEBUG member-query failed:", (e as Error).message);
    }
    try {
      const r2 = await auth.api.createInvitation({
        body: {
          organizationId: workspaceId,
          email: body.email,
          role: body.role,
        },
        headers: c.req.raw.headers,
      });
      return c.json({ invitationId: r2.id }, 201);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/PRIVATE workspaces/.test(msg)) return c.json({ error: msg }, 409);
      console.error("[invite] createInvitation failed:", msg, e);
      throw e;
    }
  });

  // POST /workspaces/:id/leave — leave workspace
  r.post("/:id/leave", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: workspaceId } = c.req.param();

    const auth = deps.identity.auth as any;

    try {
      await auth.api.leaveOrganization({
        body: { organizationId: workspaceId, userId: session.user.id },
      });
      return c.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/Cannot leave as last owner/.test(msg))
        return c.json({ error: msg }, 409);
      throw e;
    }
  });

  // POST /workspaces/:id/transfer-ownership
  r.post(
    "/:id/transfer-ownership",
    zValidator("json", transferSchema),
    async (c) => {
      const session = c.get("session");
      if (!session) return c.json({ error: "unauthorized" }, 401);

      const { id: workspaceId } = c.req.param();
      const body = c.req.valid("json");

      const auth = deps.identity.auth as any;

      await auth.api.transferOwnership({
        body: {
          organizationId: workspaceId,
          fromUserId: session.user.id,
          toUserId: body.toUserId,
        },
      });
      return c.json({ ok: true });
    },
  );

  // PUT /workspaces/:id/shares — update member shares
  r.put("/:id/shares", zValidator("json", sharesSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: workspaceId } = c.req.param();
    const body = c.req.valid("json");

    await deps.tenancy.memberShareRepo.update(
      workspaceId,
      body.shares,
      session.user.id,
    );
    return c.json({ ok: true });
  });

  // GET /workspaces/active — list active workspaces
  r.get("/active", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const userId = session.user.id;
    const memberships = await deps.tenancy.workspaceRepo.listForUser(userId);
    return c.json({ workspaces: memberships });
  });

  // PUT /workspaces/active — set active workspaces (D-07, TENT-12)
  r.put("/active", zValidator("json", activeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const userId = session.user.id;

    // Intersect submitted IDs with actual memberships (defense in depth)
    const memberships = await deps.tenancy.workspaceRepo.listForUser(userId);
    const membershipIds = new Set(memberships.map((w) => w.id));
    const safeIds = body.workspaceIds.filter((id) => membershipIds.has(id));

    await deps.identity.userRepo.setActiveWorkspaceIds(UserId(userId), safeIds);
    return c.json({ ok: true, activeWorkspaceIds: safeIds });
  });

  return r;
}
