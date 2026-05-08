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
import { sql } from "drizzle-orm";
import type { BootedDeps } from "../boot";
import { UserId } from "@budget/shared-kernel";

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
        headers: c.req.raw.headers,
      });
      return c.json({ id: r2.id, name: body.name }, 201);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/PRIVATE workspaces/.test(msg)) return c.json({ error: msg }, 409);
      console.error("[create-ws] failed:", msg, e);
      throw e;
    }
  });

  // POST /workspaces/:id/invitations — invite member
  // Bypasses Better Auth's createInvitation: its findMemberByOrgId SELECT runs
  // without app.current_user_id GUC and is filtered out by RLS in CI (app_role
  // connection). We do the membership check ourselves through
  // withBootstrapUserContext (which sets the GUC), then INSERT directly into
  // tenancy.workspace_invitations (table has no RLS — token-keyed lookup) and
  // dispatch the invitation email.
  r.post("/:id/invitations", zValidator("json", inviteSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: workspaceId } = c.req.param();
    const body = c.req.valid("json");

    const { withBootstrapUserContext, appPool } =
      await import("@budget/platform");

    const lookup = await withBootstrapUserContext(
      UserId(session.user.id),
      async (tx) => {
        const result = await tx.execute(sql`
          SELECT wm.role::text AS role, w.kind::text AS kind, w.name AS name
            FROM tenancy.workspace_members wm
            JOIN tenancy.workspaces w ON w.id = wm.workspace_id
           WHERE wm.workspace_id = ${workspaceId}::uuid
             AND wm.user_id = ${session.user.id}::uuid
           LIMIT 1
        `);
        return result.rows[0] as
          | { role: string; kind: string; name: string }
          | undefined;
      },
    );

    if (lookup.isErr()) {
      console.error("[invite] lookup failed:", lookup.error);
      return c.json({ error: "internal" }, 500);
    }
    if (!lookup.value) {
      return c.json({ error: "Member not found" }, 404);
    }
    if (lookup.value.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }
    if (lookup.value.kind === "PRIVATE") {
      return c.json(
        {
          error:
            "PRIVATE workspaces accept only the owner. Convert to SHARED first.",
        },
        409,
      );
    }

    const invitationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      await appPool().query(
        `INSERT INTO tenancy.workspace_invitations
          (id, workspace_id, email, role, status, inviter_id, expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [
          invitationId,
          workspaceId,
          body.email,
          body.role,
          session.user.id,
          expiresAt,
        ],
      );
    } catch (e) {
      console.error("[invite] insert failed:", (e as Error).message);
      throw e;
    }

    try {
      const inviterName =
        ((session.user as { name?: string }).name ?? session.user.email) ||
        "A workspace owner";
      await deps.emailSender.send({
        to: body.email,
        template: "workspace-invite",
        vars: {
          url: `${deps.env.APP_URL}/accept-invitation/${invitationId}`,
          workspace: lookup.value.name,
          inviter: inviterName,
        },
      });
    } catch (e) {
      console.error("[invite] email send failed:", (e as Error).message);
      // Email failure is not fatal — invitation row exists.
    }

    return c.json({ invitationId }, 201);
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
