/**
 * budgets.ts — /budgets route factory
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
import { DrizzleBudgetShareLinkRepo } from "@budget/tenancy/src/adapters/persistence/budget-share-link-repo";
import { createShareLink } from "@budget/tenancy/src/application/create-share-link";
import { revokeShareLink } from "@budget/tenancy/src/application/revoke-share-link";

export function budgetsRoutesFactory(deps: BootedDeps) {
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

  // GET /budgets/health — smoke endpoint (ROADMAP success criterion #5)
  r.get("/health", (c) => c.json({ ok: true, phase: "1" }));

  // POST /budgets — create new budget
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
      if (/PRIVATE budgets/.test(msg) || /PRIVATE workspaces/.test(msg))
        return c.json({ error: msg }, 409);
      console.error("[create-budget] failed:", msg, e);
      throw e;
    }
  });

  // POST /budgets/:id/invitations — invite member
  // Bypasses Better Auth's createInvitation: its findMemberByOrgId SELECT runs
  // without app.current_user_id GUC and is filtered out by RLS in CI (app_role
  // connection). We do the membership check ourselves through
  // withBootstrapUserContext (which sets the GUC), then INSERT directly into
  // tenancy.budget_invitations (table has no RLS — token-keyed lookup) and
  // dispatch the invitation email.
  r.post("/:id/invitations", zValidator("json", inviteSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: budgetId } = c.req.param();
    const body = c.req.valid("json");

    const { withBootstrapUserContext, appPool } =
      await import("@budget/platform");

    const lookup = await withBootstrapUserContext(
      UserId(session.user.id),
      async (tx) => {
        const result = await tx.execute(sql`
          SELECT bm.role::text AS role, b.kind::text AS kind, b.name AS name
            FROM tenancy.budget_members bm
            JOIN tenancy.budgets b ON b.id = bm.budget_id
           WHERE bm.budget_id = ${budgetId}::uuid
             AND bm.user_id = ${session.user.id}::uuid
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
            "PRIVATE budgets accept only the owner. Convert to SHARED first.",
        },
        409,
      );
    }

    const invitationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      await appPool().query(
        `INSERT INTO tenancy.budget_invitations
          (id, budget_id, email, role, status, inviter_id, expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [
          invitationId,
          budgetId,
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
        "A budget owner";
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

  // POST /budgets/:id/leave — leave budget
  r.post("/:id/leave", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: budgetId } = c.req.param();

    const auth = deps.identity.auth as any;

    try {
      await auth.api.leaveOrganization({
        body: { organizationId: budgetId, userId: session.user.id },
      });
      return c.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/Cannot leave as last owner/.test(msg))
        return c.json({ error: msg }, 409);
      throw e;
    }
  });

  // POST /budgets/:id/transfer-ownership
  r.post(
    "/:id/transfer-ownership",
    zValidator("json", transferSchema),
    async (c) => {
      const session = c.get("session");
      if (!session) return c.json({ error: "unauthorized" }, 401);

      const { id: budgetId } = c.req.param();
      const body = c.req.valid("json");

      const auth = deps.identity.auth as any;

      await auth.api.transferOwnership({
        body: {
          organizationId: budgetId,
          fromUserId: session.user.id,
          toUserId: body.toUserId,
        },
      });
      return c.json({ ok: true });
    },
  );

  // PUT /budgets/:id/shares — update member shares
  r.put("/:id/shares", zValidator("json", sharesSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: budgetId } = c.req.param();
    const body = c.req.valid("json");

    await deps.tenancy.memberShareRepo.update(
      budgetId,
      body.shares,
      session.user.id,
    );
    return c.json({ ok: true });
  });

  // GET /budgets/:id/reserves — per-category reserve balances (RSCM-01, RSCM-02)
  r.get("/:id/reserves", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantId = budgetId; // v1.1: budget_id === tenant_id

    const balances = await deps.budgeting.reserveBalanceRepo.getForBudget(
      budgetId,
      tenantId,
      new Date(),
    );

    const reserves = Array.from(balances.entries()).map(
      ([categoryId, money]) => ({
        categoryId,
        balanceCents: money.amount.times("100").toFixed(0),
      }),
    );

    return c.json({ budgetId, reserves });
  });

  // POST /budgets/:id/share — create share link (owner only, SHRD-01)
  r.post(
    "/:id/share",
    zValidator(
      "json",
      z.object({
        ttlDays: z.number().int().min(1).max(90).optional().default(7),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      if (!session) return c.json({ error: "unauthorized" }, 401);

      const budgetId = c.req.param("id");
      const { ttlDays } = c.req.valid("json");

      const repo = new DrizzleBudgetShareLinkRepo();

      try {
        const result = await createShareLink(
          { budgetShareLinkRepo: repo, appUrl: deps.env.APP_URL },
          {
            budgetId,
            tenantId: budgetId, // v1.1: budget_id === tenant_id
            userId: session.user.id,
            ttlDays,
          },
        );
        return c.json(result, 201);
      } catch (e: unknown) {
        const msg = (e as Error).message ?? "unknown";
        if (msg === "Forbidden") return c.json({ error: "Forbidden" }, 403);
        console.error("[share-link:create] failed:", msg);
        throw e;
      }
    },
  );

  // DELETE /budgets/share/:linkId — revoke share link (owner only, SHRD-05)
  r.delete("/share/:linkId", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const linkId = c.req.param("linkId");
    // tenantId derived from the link itself inside revokeShareLink service
    // Pass empty string as tenantId — revoke uses the link's own budget_id via JOIN
    const tenantId = ""; // overridden by revokeShareLink inner JOIN lookup

    const repo = new DrizzleBudgetShareLinkRepo();

    try {
      await revokeShareLink(
        { budgetShareLinkRepo: repo },
        { linkId, tenantId, userId: session.user.id },
      );
      return c.body(null, 204);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "unknown";
      if (msg === "Forbidden") return c.json({ error: "Forbidden" }, 403);
      console.error("[share-link:revoke] failed:", msg);
      throw e;
    }
  });

  // GET /budgets/active — list active budgets
  r.get("/active", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const userId = session.user.id;
    const memberships = await deps.tenancy.workspaceRepo.listForUser(userId);
    return c.json({ workspaces: memberships });
  });

  // PUT /budgets/active — set active budgets (D-07, TENT-12)
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
