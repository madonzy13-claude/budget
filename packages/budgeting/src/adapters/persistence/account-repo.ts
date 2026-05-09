/**
 * account-repo.ts — Drizzle adapter for AccountRepo port
 * MUST NOT be imported by domain/application layers (dep-cruiser).
 * Each write: withTenantTx → SQL → writeAudit → writeOutbox.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, Money } from "@budget/shared-kernel";
import type { Account } from "../../domain/account";
import type { AccountRepo } from "../../ports/account-repo";

function rowToAccount(row: {
  id: string;
  tenant_id: string;
  name: string;
  kind: string;
  scope: string;
  currency: string;
  current_balance: string;
  archived_at: Date | null;
  created_at: Date;
  actor_user_id: string;
}): Account {
  const { Account: AccountClass } = require("../../domain/account");
  return new AccountClass(
    row.id,
    row.tenant_id,
    row.name,
    row.kind as any,
    row.scope as any,
    row.currency,
    Money.fromDb(row.current_balance ?? "0", row.currency as any),
    row.archived_at ? new Date(row.archived_at) : null,
    new Date(row.created_at),
    row.actor_user_id,
  );
}

export class DrizzleAccountRepo implements AccountRepo {
  async create(account: Account): Promise<void> {
    const tid = TenantId(account.tenantId);
    const uid = UserId(account.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`INSERT INTO budgeting.accounts
              (id, tenant_id, name, kind, scope, currency, current_balance, archived_at, created_at, actor_user_id)
            VALUES
              (${account.id}::uuid, ${account.tenantId}::uuid, ${account.name},
               ${account.kind}, ${account.scope}, ${account.currency},
               ${account.currentBalance.amount.toFixed(4)}::numeric,
               ${account.archivedAt?.toISOString() ?? null},
               ${account.createdAt.toISOString()}, ${account.actorUserId}::uuid)`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "account",
        entityId: account.id,
        action: "create",
        actorUserId: uid,
        before: null,
        after: {
          name: account.name,
          kind: account.kind,
          scope: account.scope,
          currency: account.currency,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "account",
        aggregateId: account.id,
        eventType: "budgeting.account.created",
        payload: {
          kind: account.kind,
          currency: account.currency,
          actorUserId: account.actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async findById(tenantId: string, id: string): Promise<Account | null> {
    // withTenantTx sets app.tenant_ids GUC for RLS
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // use tenantId as placeholder userId for reads
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        name: string;
        kind: string;
        scope: string;
        currency: string;
        current_balance: string;
        archived_at: Date | null;
        created_at: Date;
        actor_user_id: string;
      }>(
        sql`SELECT id, tenant_id, name, kind, scope, currency, current_balance::text,
                   archived_at, created_at, actor_user_id
            FROM budgeting.accounts
            WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToAccount(r.value);
  }

  async list(tenantId: string, includeArchived: boolean): Promise<Account[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      let result;
      if (includeArchived) {
        result = await tx.execute<{
          id: string;
          tenant_id: string;
          name: string;
          kind: string;
          scope: string;
          currency: string;
          current_balance: string;
          archived_at: Date | null;
          created_at: Date;
          actor_user_id: string;
        }>(
          sql`SELECT id, tenant_id, name, kind, scope, currency, current_balance::text,
                     archived_at, created_at, actor_user_id
              FROM budgeting.accounts
              WHERE tenant_id = ${tenantId}::uuid
              ORDER BY created_at ASC`,
        );
      } else {
        result = await tx.execute<{
          id: string;
          tenant_id: string;
          name: string;
          kind: string;
          scope: string;
          currency: string;
          current_balance: string;
          archived_at: Date | null;
          created_at: Date;
          actor_user_id: string;
        }>(
          sql`SELECT id, tenant_id, name, kind, scope, currency, current_balance::text,
                     archived_at, created_at, actor_user_id
              FROM budgeting.accounts
              WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL
              ORDER BY created_at ASC`,
        );
      }
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map(rowToAccount);
  }

  async archive(
    tenantId: string,
    accountId: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`UPDATE budgeting.accounts
            SET archived_at = now()
            WHERE id = ${accountId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "account",
        entityId: accountId,
        action: "update",
        actorUserId: uid,
        before: { archivedAt: null },
        after: { archivedAt: new Date().toISOString() },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "account",
        aggregateId: accountId,
        eventType: "budgeting.account.archived",
        payload: { actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async recordAdjustment(
    tenantId: string,
    accountId: string,
    delta: { amount: string; currency: string },
    reason: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // Insert balance adjustment record
      const adjId = crypto.randomUUID();
      await tx.execute(
        sql`INSERT INTO budgeting.account_balance_adjustments
              (id, tenant_id, account_id, delta_amount, delta_currency, reason, actor_user_id)
            VALUES
              (${adjId}::uuid, ${tenantId}::uuid, ${accountId}::uuid,
               ${delta.amount}::numeric, ${delta.currency}, ${reason}, ${actorUserId}::uuid)`,
      );

      // Update current_balance synchronously (D-05-e)
      await tx.execute(
        sql`UPDATE budgeting.accounts
            SET current_balance = current_balance + ${delta.amount}::numeric
            WHERE id = ${accountId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "account",
        entityId: accountId,
        action: "update",
        actorUserId: uid,
        before: null,
        after: {
          adjustmentId: adjId,
          delta: delta.amount,
          currency: delta.currency,
          reason,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "account",
        aggregateId: accountId,
        eventType: "budgeting.account.balance_adjusted",
        payload: {
          adjustmentId: adjId,
          delta: delta.amount,
          currency: delta.currency,
          actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  /**
   * applyDelta — used inside ledger writer tx (D-05-e, plan 02-06).
   * Does NOT open its own transaction.
   */
  async applyDelta(
    tx: unknown,
    accountId: string,
    deltaAmountStr: string,
  ): Promise<void> {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };
    await drizzleTx.execute(
      sql`UPDATE budgeting.accounts
          SET current_balance = current_balance + ${deltaAmountStr}::numeric
          WHERE id = ${accountId}::uuid`,
    );
  }
}
