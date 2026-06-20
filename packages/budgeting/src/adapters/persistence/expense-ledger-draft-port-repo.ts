/**
 * expense-ledger-draft-port-repo.ts — Drizzle adapter for ExpenseLedgerDraftPortRepo port.
 *
 * Phase 4 dismiss/confirm surface for recurring drafts.
 * Each write: withTenantTx → SELECT (guard) → UPDATE → writeAudit → writeOutbox.
 * Tenant isolation: WHERE tenant_id = $tenantId on every row lookup (T-04-02-03, T-04-02-04).
 *
 * RECR-03, RECR-04, RECR-06
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { ExpenseLedgerDraftPortRepo } from "../../ports/expense-ledger-draft-port-repo";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export class DrizzleExpenseLedgerDraftPortRepo implements ExpenseLedgerDraftPortRepo {
  async dismiss(
    tenantId: string,
    draftId: string,
    actorUserId: string,
  ): Promise<"ok" | "not_found" | "already_confirmed"> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as DrizzleTx;

      // Guard: fetch current state to check confirmed_at
      const lookup = await drizzleTx.execute(sql`
        SELECT confirmed_at
          FROM budgeting.expense_ledger
         WHERE id = ${draftId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND deleted_at IS NULL
         LIMIT 1
      `);

      if (lookup.rows.length === 0) return "not_found" as const;
      if (lookup.rows[0].confirmed_at !== null)
        return "already_confirmed" as const;

      await drizzleTx.execute(sql`
        UPDATE budgeting.expense_ledger
           SET dismissed_at = now(),
               updated_at = now()
         WHERE id = ${draftId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND confirmed_at IS NULL
           AND deleted_at IS NULL
      `);

      // 260612-kxd T3: resolve the matching PENDING CONFIRM_DRAFT task in the
      // SAME tx. Previously dismiss-draft.ts opened a SEPARATE withTenantTx
      // ("A2 fallback") — a dismiss that committed while the resolve raced
      // left the task PENDING for one poll cycle. Mirrors the in-tx resolve
      // skip-recurring-draft.ts already does. Idempotent (status='PENDING').
      await drizzleTx.execute(sql`
        UPDATE budgeting.tasks
           SET status = 'RESOLVED', resolved_at = now()
         WHERE tenant_id = ${tenantId}::uuid
           AND kind = 'CONFIRM_DRAFT'
           AND payload_json->>'draft_id' = ${draftId}
           AND status = 'PENDING'
      `);

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "expense_ledger_draft",
        entityId: draftId,
        action: "update",
        actorUserId: uid,
        before: { dismissed_at: null },
        after: { dismissed_at: "now()" },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "expense_ledger_draft",
        aggregateId: draftId,
        eventType: "budgeting.recurring_draft.dismissed",
        payload: { draftId, actorUserId },
      });

      return "ok" as const;
    });

    if (r.isErr()) throw r.error;
    return r.value;
  }

  async confirm(
    tenantId: string,
    draftId: string,
    actorUserId: string,
    amountOverrideCents?: number,
  ): Promise<"ok" | "not_found" | "already_confirmed" | "already_dismissed"> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as DrizzleTx;

      // Guard: fetch current state
      const lookup = await drizzleTx.execute(sql`
        SELECT confirmed_at, dismissed_at
          FROM budgeting.expense_ledger
         WHERE id = ${draftId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND deleted_at IS NULL
         LIMIT 1
      `);

      const rows = lookup.rows;
      if (rows.length === 0) return "not_found" as const;
      if (rows[0].confirmed_at !== null) return "already_confirmed" as const;
      if (rows[0].dismissed_at !== null) return "already_dismissed" as const;

      const amountClause =
        amountOverrideCents !== undefined &&
        Number.isFinite(amountOverrideCents)
          ? sql`amount_original_cents = ${amountOverrideCents}::bigint,
                 amount_converted_cents = ${amountOverrideCents}::bigint,`
          : sql``;

      await drizzleTx.execute(sql`
        UPDATE budgeting.expense_ledger
           SET ${amountClause}
               confirmed_at = now(),
               updated_at = now()
         WHERE id = ${draftId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND confirmed_at IS NULL
           AND dismissed_at IS NULL
           AND deleted_at IS NULL
      `);

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "expense_ledger_draft",
        entityId: draftId,
        action: "update",
        actorUserId: uid,
        before: { confirmed_at: null },
        after: { confirmed_at: "now()" },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "expense_ledger_draft",
        aggregateId: draftId,
        eventType: "budgeting.recurring_draft.confirmed",
        payload: { draftId, actorUserId },
      });

      return "ok" as const;
    });

    if (r.isErr()) throw r.error;
    return r.value;
  }
}
