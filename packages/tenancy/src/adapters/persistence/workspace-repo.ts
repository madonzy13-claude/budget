// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createTenancyModule() from contracts/factory.ts (PC-02, PC-15).
import { sql } from "drizzle-orm";
import {
  withTenantTx,
  withUserContext,
  withInfraTx,
  withBootstrapUserContext,
  writeAudit,
  writeOutbox,
} from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { validateShares } from "../../domain/share";
import type { BudgetDTO, MemberDTO, MemberShareDTO } from "../../contracts/api";
import type { BudgetRepo } from "../../ports/budget-repo";
import type { MemberShareRepo } from "../../ports/member-repo";

export class DrizzleBudgetRepo implements BudgetRepo {
  async findById(id: string): Promise<BudgetDTO | null> {
    // withInfraTx: infrastructure carve-out (PC-04). findById is called in bootstrap paths
    // before the tenant context is established (e.g., by application services verifying a
    // budget exists). The RLS predicate on budgets uses app.tenant_ids — without GUC,
    // no rows are returned for app_role. We use workerDb (withinfraTx) here as the resolver
    // runs under a service context not a user request context.
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        slug: string;
        name: string;
        kind: string;
        default_currency: string;
        owner_user_id: string;
        member_count: number;
        created_at: Date;
        cushion_mode_enabled: boolean;
        reserves_enabled: boolean;
        cushion_enabled: boolean;
        cushion_target_months: number;
      }>(
        sql`SELECT id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, cushion_mode_enabled, reserves_enabled, cushion_enabled, cushion_target_months
            FROM tenancy.budgets WHERE id = ${id}`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    const row = r.value;
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind as "PRIVATE" | "SHARED",
      default_currency: row.default_currency,
      ownerUserId: row.owner_user_id,
      memberCount: row.member_count,
      createdAt: row.created_at,
      cushionModeEnabled: row.cushion_mode_enabled,
      reservesEnabled: row.reserves_enabled ?? true,
      cushionEnabled: row.cushion_enabled ?? true,
      cushionTargetMonths: row.cushion_target_months ?? 6,
      pendingTasksCount: 0,
    };
  }

  async listForUser(userId: string): Promise<BudgetDTO[]> {
    const r = await withUserContext(UserId(userId), async (tx) => {
      // RLS gap: `budgets_select_open` requires EITHER (a) the budget id
      // is in app.tenant_ids OR (b) the caller is owner_user_id. A member
      // (non-owner) of a SHARED budget would otherwise fail both checks
      // here — withUserContext sets app.current_user_id but never sets
      // tenant_ids, and the user is not the owner. Resolve member-budget
      // ids first via the `budget_members_self` policy, then SET LOCAL
      // tenant_ids so the JOIN below sees the corresponding budget rows.
      //
      // Why two queries rather than a CTE: SET LOCAL only accepts literal
      // text (no bind parameters), so we materialise the id list in app
      // code, sanitise to UUID shape, and inject as a comma-separated
      // literal array. SET LOCAL is scoped to this transaction.
      const memberRows = await tx.execute<{ budget_id: string }>(sql`
        SELECT budget_id
          FROM tenancy.budget_members
         WHERE user_id = ${userId}::uuid
      `);
      const memberBudgetIds = memberRows.rows.map((r2) => r2.budget_id);
      if (memberBudgetIds.length > 0) {
        const safeIds = memberBudgetIds
          .filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))
          .join(",");
        if (safeIds.length > 0) {
          await tx.execute(
            sql.raw(`SET LOCAL app.tenant_ids = '{${safeIds}}'`),
          );
        }
      }

      const result = await tx.execute<{
        id: string;
        slug: string;
        name: string;
        kind: string;
        default_currency: string;
        owner_user_id: string;
        member_count: number;
        created_at: Date;
        cushion_mode_enabled: boolean;
        pending_tasks_count: number;
      }>(sql`
        SELECT w.id, w.slug, w.name, w.kind, w.default_currency,
               w.owner_user_id, w.member_count, w.created_at, w.cushion_mode_enabled,
               COALESCE(tk.pending, 0)::int AS pending_tasks_count
        FROM tenancy.budgets w
        INNER JOIN tenancy.budget_members m ON m.budget_id = w.id
        LEFT JOIN (
          SELECT budget_id, COUNT(*)::bigint AS pending
            FROM budgeting.tasks
           WHERE status = 'PENDING'
           GROUP BY budget_id
        ) tk ON tk.budget_id = w.id
        WHERE m.user_id = ${userId}
          AND w.archived_at IS NULL
      `);
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind as "PRIVATE" | "SHARED",
      default_currency: row.default_currency,
      ownerUserId: row.owner_user_id,
      memberCount: row.member_count,
      createdAt: row.created_at,
      cushionModeEnabled: row.cushion_mode_enabled,
      pendingTasksCount: Number(row.pending_tasks_count),
    }));
  }

  async listMembers(budgetId: string): Promise<MemberDTO[]> {
    // withInfraTx: infrastructure carve-out for listing members.
    // JOIN identity.users to include name/email for display in the members section (WR-05).
    // tenancy.budget_members has FORCE RLS — its SELECT policies require either
    // `app.tenant_ids` or `app.current_user_id` to be set. The infra tx opens a
    // fresh connection with neither GUC, so we must set tenant_ids here for the
    // open-policy to let the rows through. Sanitize budgetId to keep this SET
    // LOCAL strictly UUID-shaped (literal injection is the only safe form for
    // PG GUCs; bind-parameters are not accepted in SET).
    const safeId = budgetId.replace(/[^a-fA-F0-9-]/g, "");
    const r = await withInfraTx(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));
      const result = await tx.execute<{
        budget_id: string;
        user_id: string;
        role: string;
        created_at: Date;
        name: string | null;
        email: string | null;
      }>(
        sql`SELECT bm.budget_id, bm.user_id, bm.role, bm.created_at,
                   u.name, u.email
            FROM tenancy.budget_members bm
            LEFT JOIN identity.users u ON u.id = bm.user_id
            WHERE bm.budget_id = ${budgetId}`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      budgetId: row.budget_id,
      userId: row.user_id,
      role: row.role as "owner" | "member",
      joinedAt: row.created_at,
      name: row.name ?? undefined,
      email: row.email ?? undefined,
    }));
  }

  async updateIdentity(
    budgetId: string,
    patch: {
      name?: string;
      defaultCurrency?: string;
      reservesEnabled?: boolean;
      cushionEnabled?: boolean;
      // Phase 7 Plan 07-07 (D-PH7-15, D-PH7-33): cushion target months —
      // multiplier for category cushion_amount in the cushion summary math.
      // Range 1..60 enforced at API (Zod) AND DB (CHECK constraint via
      // migration 0026). NOT NULL DEFAULT 6 at the column level.
      cushionTargetMonths?: number;
    },
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(budgetId);
    const uid = UserId(actorUserId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      if (patch.name !== undefined) {
        await tx.execute(
          sql`UPDATE tenancy.budgets SET name = ${patch.name} WHERE id = ${budgetId}::uuid`,
        );
      }
      if (patch.defaultCurrency !== undefined) {
        await tx.execute(
          sql`UPDATE tenancy.budgets SET default_currency = ${patch.defaultCurrency} WHERE id = ${budgetId}::uuid`,
        );
      }
      if (patch.reservesEnabled !== undefined) {
        // ONBD: Reserves global toggle. Boolean only — no SCD-2 history.
        // Owner gate is enforced upstream in the budget-identity route.
        await tx.execute(
          sql`UPDATE tenancy.budgets SET reserves_enabled = ${patch.reservesEnabled} WHERE id = ${budgetId}::uuid`,
        );
      }
      if (patch.cushionEnabled !== undefined) {
        // ONBD: Cushion global toggle. Boolean only — no SCD-2 history.
        // Distinct from cushion_mode_enabled (which records per-month
        // cushion vs normal state via budget_mode_history). Owner gate
        // is enforced upstream in the budget-identity route.
        await tx.execute(
          sql`UPDATE tenancy.budgets SET cushion_enabled = ${patch.cushionEnabled} WHERE id = ${budgetId}::uuid`,
        );
      }
      if (patch.cushionTargetMonths !== undefined) {
        // Phase 7 Plan 07-07 (D-PH7-15): cushion_target_months column
        // (INT NOT NULL DEFAULT 6, CHECK 1..60). Owner gate enforced
        // upstream in the budget-identity route; recompute hook fires
        // after this UPDATE lands in a separate withTenantTx.
        await tx.execute(
          sql`UPDATE tenancy.budgets SET cushion_target_months = ${patch.cushionTargetMonths} WHERE id = ${budgetId}::uuid`,
        );
      }
    });
    if (r.isErr()) throw r.error;
  }

  /**
   * Add `userId` to `budgetId` as a member with `role` (default 'member').
   *
   * Used by the share-link accept flow (SHRD-02) where the recipient
   * cannot legitimately call Better Auth's `addMember` — that API gates
   * on the CALLER being an admin/owner of the org, but here the caller
   * IS the recipient. We INSERT directly into `tenancy.budget_members`
   * (the same table the org plugin writes through its Drizzle adapter)
   * and bump `budgets.member_count` in the same tx so the cached counter
   * stays accurate.
   *
   * Idempotent: ON CONFLICT DO NOTHING — re-running with the same
   * (budget_id, user_id) pair is a no-op, so a double-submit can't
   * inflate member_count.
   *
   * Connection: this runs under `withBootstrapUserContext` (app_role
   * connection, app.current_user_id set, app.tenant_ids INTENTIONALLY
   * empty). Two reasons:
   *   1. The accepting user is, by definition, NOT yet a member, so
   *      they cannot legitimately set app.tenant_ids to include this
   *      budget — they only gain that membership AFTER this insert.
   *   2. `worker_role` (used by withInfraTx) has SELECT-only grants on
   *      tenancy.budget_members; the INSERT must go through app_role.
   *
   * The FORCE-RLS check on the table still applies: the
   * `budget_members_insert_open` policy has WITH CHECK (true), so the
   * write succeeds without needing tenant context. The synthetic
   * tenant_ids GUC is also set inside the tx so the SELECT pre-check
   * below can see the candidate row (otherwise RLS would hide it and
   * we'd incorrectly attempt a duplicate insert).
   */
  async joinAsMember(
    budgetId: string,
    userId: string,
    role: "owner" | "member" = "member",
  ): Promise<void> {
    const safeId = budgetId.replace(/[^a-fA-F0-9-]/g, "");
    const memberId = crypto.randomUUID();
    const uid = UserId(userId);
    const r = await withBootstrapUserContext(uid, async (tx) => {
      // The bootstrap context sets app.current_user_id only — for the
      // SELECT existence check below we additionally need the candidate
      // budget id visible via app.tenant_ids so RLS doesn't filter it.
      // SET LOCAL is the only safe form here (PG GUCs reject bind
      // parameters), so the id is sanitized to a UUID shape.
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));

      // tenancy.budget_members has no UNIQUE on (budget_id, user_id),
      // so we can't lean on ON CONFLICT for idempotency. Pre-check
      // inside the same tx instead: the share-link accept() path takes
      // a row-level UPDATE on the share-link row immediately after, so
      // a concurrent double-accept is rejected at that layer — the
      // tx serializes the membership write with the link update.
      const existing = await tx.execute<{ id: string }>(sql`
        SELECT id FROM tenancy.budget_members
         WHERE budget_id = ${budgetId}::uuid
           AND user_id   = ${userId}::uuid
         LIMIT 1
      `);
      if ((existing.rowCount ?? 0) > 0) return;

      await tx.execute(sql`
        INSERT INTO tenancy.budget_members (id, budget_id, user_id, role)
        VALUES (${memberId}::uuid, ${budgetId}::uuid, ${userId}::uuid, ${role})
      `);

      // Bump the cached member_count counter the Better Auth org plugin
      // and a few read paths rely on for sizing the members list.
      await tx.execute(sql`
        UPDATE tenancy.budgets
           SET member_count = member_count + 1
         WHERE id = ${budgetId}::uuid
      `);
    });
    if (r.isErr()) throw r.error;
  }

  /**
   * Remove a user's membership from `budgetId`. Throws `Error("last_owner")`
   * if the caller is the sole remaining OWNER on the budget so the route
   * layer can map to 409.
   *
   * Runs under `withBootstrapUserContext` (app_role, app.current_user_id
   * set) for the same reasons joinAsMember does:
   *   * The user is leaving — they cannot set app.tenant_ids for a budget
   *     they're about to no longer belong to.
   *   * worker_role has SELECT-only grants on budget_members; the DELETE
   *     must go through app_role.
   *
   * We SET LOCAL tenant_ids to the budget id inside the tx so the
   * `budget_members_tenant_delete` policy (USING budget_id IN tenant_ids)
   * permits the DELETE. The candidate row's user_id is also constrained
   * to the caller's own user id, so a user can never delete somebody
   * else's membership through this method.
   */
  async leaveAsMember(budgetId: string, userId: string): Promise<void> {
    const safeId = budgetId.replace(/[^a-fA-F0-9-]/g, "");
    const uid = UserId(userId);
    const r = await withBootstrapUserContext(uid, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));

      // Confirm membership exists and capture the role for the
      // last-owner check below. The pre-check + DELETE run in the same
      // tx; if a concurrent membership change races between them, the
      // DELETE's WHERE clause is still strict enough to be a no-op
      // (zero rows affected) — we don't leak a partial state.
      const memberRow = await tx.execute<{ role: string }>(sql`
        SELECT role FROM tenancy.budget_members
         WHERE budget_id = ${budgetId}::uuid
           AND user_id   = ${userId}::uuid
         LIMIT 1
      `);
      if ((memberRow.rowCount ?? 0) === 0) {
        // No membership → nothing to leave. Treat as success: the
        // user's intent ("I am not a member of this budget") is
        // satisfied either way.
        return;
      }
      const callerRole = memberRow.rows[0]?.role;

      if (callerRole === "owner") {
        // Count remaining owners. If the caller is the only one, they
        // cannot leave — the budget would be orphaned. Surface as
        // last_owner so the route maps to 409 and the UI prompts the
        // owner to delete the budget instead.
        const otherOwners = await tx.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count
            FROM tenancy.budget_members
           WHERE budget_id = ${budgetId}::uuid
             AND user_id  <> ${userId}::uuid
             AND role     = 'owner'
        `);
        if ((otherOwners.rows[0]?.count ?? 0) === 0) {
          throw new Error("last_owner");
        }
      }

      const del = await tx.execute(sql`
        DELETE FROM tenancy.budget_members
         WHERE budget_id = ${budgetId}::uuid
           AND user_id   = ${userId}::uuid
      `);

      // Decrement the cached member_count counter only when a row was
      // actually deleted. ON CONFLICT-style retries can't double-count.
      if ((del.rowCount ?? 0) > 0) {
        await tx.execute(sql`
          UPDATE tenancy.budgets
             SET member_count = GREATEST(member_count - 1, 0)
           WHERE id = ${budgetId}::uuid
        `);
      }
    });
    if (r.isErr()) throw r.error;
  }

  async hasTransactions(budgetId: string): Promise<boolean> {
    // withInfraTx: infrastructure carve-out — exists query runs in service context,
    // not user request context (same pattern as findById).
    // expense_ledger has tenant-scoped RLS, so set app.tenant_ids in this tx
    // before the EXISTS query — otherwise RLS hides every row and the check
    // would always report `false` (silently breaking the currency lock).
    const safeId = budgetId.replace(/[^a-fA-F0-9-]/g, "");
    const r = await withInfraTx(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));
      // Currency lock fires once a budget has any non-deleted ledger entry.
      // The ledger table is budgeting.expense_ledger (not "transactions").
      const res = await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS(
          SELECT 1 FROM budgeting.expense_ledger
          WHERE budget_id = ${budgetId}::uuid AND deleted_at IS NULL
        ) AS exists
      `);
      return res.rows[0]?.exists ?? false;
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  /** D-09 / SETT-08: soft-delete — sets archived_at = now(). One-way in v1.1. */
  async archive(
    budgetId: string,
    actorUserId: string,
  ): Promise<{ archivedAt: string }> {
    const tid = TenantId(budgetId);
    const uid = UserId(actorUserId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      const res = await tx.execute<{ archived_at: Date }>(sql`
        UPDATE tenancy.budgets
           SET archived_at = now()
         WHERE id = ${budgetId}::uuid
         RETURNING archived_at
      `);
      return res.rows[0]?.archived_at ?? new Date();
    });
    if (r.isErr()) throw r.error;
    // pg may return `archived_at` as a Date OR as an ISO string depending on
    // node-postgres date parsing config. Normalize through `new Date()` so
    // callers always get a stable ISO 8601 string.
    return { archivedAt: new Date(r.value).toISOString() };
  }

  /** SETT-08: hard-delete — removes the budget row.
   *
   * Several child tables (budget_members, recurring_rules, etc.) reference
   * tenancy.budgets without ON DELETE CASCADE, so a direct DELETE on the
   * parent throws FK violation. We DELETE the known budget-scoped children
   * first, in the same tx, so the parent DELETE is unblocked.
   */
  async hardDelete(budgetId: string, actorUserId: string): Promise<void> {
    const tid = TenantId(budgetId);
    const uid = UserId(actorUserId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      // Child rows that may FK to budgets — delete in dependency order. Each
      // DELETE is a no-op if the table is empty for this budget, so missing
      // data in a fresh-from-onboarding scenario is fine.
      await tx.execute(
        sql`DELETE FROM tenancy.budget_members WHERE budget_id = ${budgetId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM tenancy.budgets WHERE id = ${budgetId}::uuid`,
      );
    });
    if (r.isErr()) throw r.error;
  }
}

// Backward-compat alias
export { DrizzleBudgetRepo as DrizzleWorkspaceRepo };

export class DrizzleMemberShareRepo implements MemberShareRepo {
  async list(budgetId: string): Promise<MemberShareDTO[]> {
    const r = await withInfraTx(async (tx) => {
      const result = await tx.execute<{
        budget_id: string;
        user_id: string;
        percentage: string;
        updated_at: Date;
      }>(
        sql`SELECT budget_id, user_id, percentage, updated_at
            FROM tenancy.shared_budget_member_shares WHERE budget_id = ${budgetId}`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map((row) => ({
      budgetId: row.budget_id,
      userId: row.user_id,
      percentage: row.percentage,
      updatedAt: row.updated_at,
    }));
  }

  async update(
    budgetId: string,
    shares: { userId: string; percentage: string }[],
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(budgetId);
    const aid = UserId(actorUserId);
    const r = await withTenantTx(tid, aid, async (tx) => {
      // Validate sum=100 in domain first (defense in depth; trigger is the second wall)
      const v = validateShares(shares);
      if (v.isErr()) throw v.error;

      // Snapshot before
      const before = await tx.execute(
        sql`SELECT user_id, percentage FROM tenancy.shared_budget_member_shares WHERE budget_id = ${budgetId}`,
      );

      // Replace all rows for this budget
      await tx.execute(
        sql`DELETE FROM tenancy.shared_budget_member_shares WHERE budget_id = ${budgetId}`,
      );
      for (const s of shares) {
        await tx.execute(
          sql`INSERT INTO tenancy.shared_budget_member_shares (budget_id, user_id, percentage)
              VALUES (${budgetId}, ${s.userId}, ${s.percentage})`,
        );
      }

      // Audit
      await writeAudit(tx, {
        tenantId: tid,
        entityType: "shared_budget_member_shares",
        entityId: budgetId,
        action: "update",
        actorUserId: aid,
        before: before.rows,
        after: shares,
      });

      // Outbox SharesUpdated event
      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "budget",
        aggregateId: budgetId,
        eventType: "tenancy.shares.updated",
        payload: { shares, actorUserId },
      });
    });
    if (r.isErr()) throw r.error;
  }
}
