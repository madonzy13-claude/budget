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
import { serverError } from "../middleware/server-error";
import { budgetIdentityRoutesFactory } from "./budget-identity";
import { registerOverviewCardsRoutes } from "./overview-cards";

export function budgetsRoutesFactory(deps: BootedDeps) {
  const r = new Hono();

  // Phase 11 (11-03): GET /budgets/:id/overview/cards — the 5-card summary.
  registerOverviewCardsRoutes(r, deps);

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

      // Default the user's global display currency to their FIRST budget's
      // currency. setDisplayCurrencyIfUnset only writes when the column is still
      // NULL (untouched), so a later budget or a manual pick is never clobbered.
      // Best-effort: a failure here must not fail budget creation.
      try {
        await deps.identity.userRepo.setDisplayCurrencyIfUnset(
          UserId(session.user.id),
          body.default_currency,
        );
      } catch (e) {
        console.error("[create-budget] display-currency seed failed:", e);
      }

      return c.json({ id: r2.id, name: body.name }, 201);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/PRIVATE budgets/.test(msg) || /PRIVATE workspaces/.test(msg))
        return c.json({ error: msg }, 409);
      console.error("[create-budget] failed:", msg, e);
      throw e;
    }
  });

  // GET /budgets/active — list active budgets (registered BEFORE /:id so Hono
  // matches the static path; otherwise `/active` collapses to `:id = "active"`
  // and 404s on the membership check.
  // v1.1 IA consistency: response carries BOTH `budgets` (canonical, v1.1) AND
  // `workspaces` (legacy alias) so existing web call sites keep working.
  r.get("/active", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const userId = session.user.id;
    const memberships = await deps.tenancy.workspaceRepo.listForUser(userId);
    return c.json({ budgets: memberships, workspaces: memberships });
  });

  // PUT /budgets/active — set active budgets (D-07, TENT-12). Registered next
  // to the matching GET to keep static-path priority over `/:id`.
  r.put("/active", zValidator("json", activeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const userId = session.user.id;

    const memberships = await deps.tenancy.workspaceRepo.listForUser(userId);
    const membershipIds = new Set(memberships.map((w) => w.id));
    const safeIds = body.workspaceIds.filter((id) => membershipIds.has(id));

    await deps.identity.userRepo.setActiveWorkspaceIds(UserId(userId), safeIds);
    return c.json({ ok: true, activeWorkspaceIds: safeIds });
  });

  // GET /budgets/:id — fetch single budget meta (D-PH5-R11: surfaces reservesEnabled flag)
  // Membership check: budgetId must be in session's tenantIds (same pattern as home-summary:248-254).
  r.get("/:id", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const budget = await deps.tenancy.workspaceRepo.findById(budgetId);
    if (!budget) return c.json({ error: "not_found" }, 404);

    const hasTransactions =
      await deps.tenancy.workspaceRepo.hasTransactions(budgetId);

    // Compute the caller's role on this budget so the web UI can gate the
    // owner-only Danger Zone (Archive/Delete) vs non-owner Leave.
    const actorUserId = (session as { user: { id: string } }).user.id;
    let currentUserRole: "owner" | "member" = "member";
    try {
      const members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
      const me = members.find((m) => m.userId === actorUserId);
      if (me) currentUserRole = me.role;
    } catch (e) {
      console.error("[budgets:get] listMembers failed:", e);
    }

    return c.json({
      id: budget.id,
      name: budget.name,
      slug: budget.slug,
      kind: budget.kind,
      defaultCurrency: budget.default_currency,
      ownerUserId: budget.ownerUserId,
      memberCount: budget.memberCount,
      cushionModeEnabled: budget.cushionModeEnabled ?? false,
      reservesEnabled: budget.reservesEnabled ?? true,
      cushionEnabled: budget.cushionEnabled ?? true,
      investmentsEnabled: budget.investmentsEnabled ?? false,
      cushionTargetMonths: budget.cushionTargetMonths ?? 6,
      hasTransactions,
      currentUserRole,
    });
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

  // POST /budgets/:id/leave — leave budget.
  //
  // Bypasses Better Auth's leaveOrganization for the same reason the
  // share-link accept bypasses addMember (see acceptShareLink doc):
  // the org plugin needs a session-headers wiring we can't carry in
  // every code path, and it produces "Headers is required" /
  // "Organization not found" failures from this entry point. Calling
  // workspaceRepo.leaveAsMember directly is the safer primitive — the
  // last-owner guard moves into the repo too so the rule lives next to
  // the DELETE.
  r.post("/:id/leave", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const { id: budgetId } = c.req.param();

    try {
      await deps.tenancy.workspaceRepo.leaveAsMember(budgetId, session.user.id);
      return c.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (msg === "last_owner") return c.json({ error: "last_owner" }, 409);
      console.error("[leave-budget] failed:", msg);
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

  // GET /budgets/:id/home-summary — HOME-02 aggregated read-model
  // (current-month spend + wallets total FX-converted server-side + top-2 overspent categories).
  // Per v1.1 invariant: budget_id === tenant_id. The tenant-guard middleware
  // verified membership and populated c.get("tenantIds"); we ALSO defensively
  // ensure budgetId is in that verified set before calling the service.
  r.get("/:id/home-summary", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }
    const userId = (session as { user: { id: string } }).user.id;

    const result = await deps.budgeting.getBudgetHomeSummary({
      budgetId,
      userId,
      now: new Date(),
    });
    if (result.isErr()) {
      const msg = (result.error as Error).message;
      if (msg === "budget_not_found")
        return c.json({ error: "not_found" }, 404);
      console.error("[home-summary] failed:", msg);
      return c.json({ error: "home_summary_failed" }, 500);
    }
    return c.json(result.value);
  });

  // GET /budgets/:id/cushion-summary — Phase 7 Plan 07-07 (D-PH7-20, D-PH7-32/33).
  // Single source of cushion math. Returns
  //   { required_cents, actual_cents, shortfall_cents, currency, enabled, target_months }
  // Used by Settings live-preview + cushion banner. Service short-circuits with
  // zero amounts when cushion_enabled=false so the read is cheap on toggle-off
  // budgets. Tenant guard: tenantIds.includes(budgetId)→404 (Pattern D — same
  // structure as the sibling /reserves and /home-summary handlers).
  r.get("/:id/cushion-summary", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const result = await deps.budgeting.getCushionSummary({
      tenantId: budgetId, // v1.1: budget_id === tenant_id
      budgetId,
    });
    if (result.isErr())
      return serverError(c, "cushion_summary_failed", result.error);
    return c.json(result.value, 200);
  });

  // GET /budgets/:id/reserves — D-PH5-R1 composed-read shape (Phase 5 Plan 03 rewrite).
  // Returns {rows, excludedRows, totals} with share math + disabled flag.
  // REPLACES the original Plan 02-03 minimal body (D-PH5-R11 cascading hide).
  // T-05-01: tenantIds gate (same pattern as home-summary:248-254).
  r.get("/:id/reserves", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const result = await deps.budgeting.getReservesSummary({
      tenantId: budgetId,
      budgetId,
    });
    if (result.isErr())
      return serverError(c, "reserves_summary_failed", result.error);
    return c.json(result.value, 200);
  });

  // POST /budgets/:id/reserves/:categoryId/adjust — append-only reserve adjustment.
  // T-05-05: use case rejects if category.reserve_excluded = true → 422.
  // T-05-01: tenantIds gate prevents cross-tenant access.
  r.post("/:id/reserves/:categoryId/adjust", async (c) => {
    const { reserveAdjustmentSchema } =
      await import("@budget/budgeting/src/contracts/api");
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId))
      return c.json({ error: "not_found" }, 404);

    const userId =
      ((c as any).get("userId") as string) ?? (session as any)?.user?.id;
    const categoryId = c.req.param("categoryId");

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = reserveAdjustmentSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          error: parsed.error.issues[0]?.message ?? "validation_error",
          issues: parsed.error.issues,
        },
        422,
      );

    const result = await deps.budgeting.adjustCategoryReserve({
      ...parsed.data,
      tenantId: budgetId,
      budgetId,
      categoryId,
      actorUserId: userId,
    });
    if (result.isErr()) {
      const m = result.error.message;
      if (m === "not_found") return c.json({ error: "not_found" }, 404);
      return c.json({ error: m }, 422);
    }
    return c.json(result.value, 200);
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

  // Mount budget-identity sub-router: PATCH /:id (SETT-02/03)
  // Registered AFTER static sub-paths (/active, /health) but BEFORE /share/:linkId
  // so /:id PATCH is handled here, not by the share revoke handler.
  r.route(
    "/",
    budgetIdentityRoutesFactory({
      tenancy: deps.tenancy,
      identity: deps.identity,
      budgeting: deps.budgeting,
    }),
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

  return r;
}
