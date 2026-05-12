/**
 * wallet-repo.ts — Drizzle adapter for WalletRepo port (renamed from account-repo.ts)
 * MUST NOT be imported by domain/application layers (dep-cruiser).
 * Each write: withTenantTx → SQL → writeAudit → writeOutbox.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, Money } from "@budget/shared-kernel";
import type { Wallet } from "../../domain/wallet";
import type { WalletRepo } from "../../ports/wallet-repo";
import type { WalletType } from "../../domain/wallet";

function rowToWallet(row: {
  id: string;
  tenant_id: string;
  name: string;
  wallet_type: string;
  currency: string;
  current_balance: string;
  archived_at: Date | null;
  created_at: Date;
  actor_user_id: string;
}): Wallet {
  const { Wallet: WalletClass } = require("../../domain/wallet");
  return new WalletClass(
    row.id,
    row.tenant_id,
    row.name,
    row.wallet_type as WalletType,
    row.currency,
    Money.fromDb(row.current_balance ?? "0", row.currency as any),
    row.archived_at ? new Date(row.archived_at) : null,
    new Date(row.created_at),
    row.actor_user_id,
  );
}

export class DrizzleWalletRepo implements WalletRepo {
  async create(wallet: Wallet): Promise<void> {
    const tid = TenantId(wallet.tenantId);
    const uid = UserId(wallet.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`INSERT INTO budgeting.wallets
              (id, tenant_id, name, wallet_type, currency, current_balance, archived_at, created_at, actor_user_id)
            VALUES
              (${wallet.id}::uuid, ${wallet.tenantId}::uuid, ${wallet.name},
               ${wallet.walletType}, ${wallet.currency},
               ${wallet.currentBalance.amount.toFixed(4)}::numeric,
               ${wallet.archivedAt?.toISOString() ?? null},
               ${wallet.createdAt.toISOString()}, ${wallet.actorUserId}::uuid)`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "wallet",
        entityId: wallet.id,
        action: "create",
        actorUserId: uid,
        before: null,
        after: {
          name: wallet.name,
          walletType: wallet.walletType,
          currency: wallet.currency,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "wallet",
        aggregateId: wallet.id,
        eventType: "budgeting.wallet.created",
        payload: {
          walletType: wallet.walletType,
          currency: wallet.currency,
          actorUserId: wallet.actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async findById(tenantId: string, id: string): Promise<Wallet | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // use tenantId as placeholder userId for reads
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        name: string;
        wallet_type: string;
        currency: string;
        current_balance: string;
        archived_at: Date | null;
        created_at: Date;
        actor_user_id: string;
      }>(
        sql`SELECT id, tenant_id, name, wallet_type, currency, current_balance::text,
                   archived_at, created_at, actor_user_id
            FROM budgeting.wallets
            WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToWallet(r.value);
  }

  async list(tenantId: string, includeArchived: boolean): Promise<Wallet[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      let result;
      if (includeArchived) {
        result = await tx.execute<{
          id: string;
          tenant_id: string;
          name: string;
          wallet_type: string;
          currency: string;
          current_balance: string;
          archived_at: Date | null;
          created_at: Date;
          actor_user_id: string;
        }>(
          sql`SELECT id, tenant_id, name, wallet_type, currency, current_balance::text,
                     archived_at, created_at, actor_user_id
              FROM budgeting.wallets
              WHERE tenant_id = ${tenantId}::uuid
              ORDER BY created_at ASC`,
        );
      } else {
        result = await tx.execute<{
          id: string;
          tenant_id: string;
          name: string;
          wallet_type: string;
          currency: string;
          current_balance: string;
          archived_at: Date | null;
          created_at: Date;
          actor_user_id: string;
        }>(
          sql`SELECT id, tenant_id, name, wallet_type, currency, current_balance::text,
                     archived_at, created_at, actor_user_id
              FROM budgeting.wallets
              WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL
              ORDER BY created_at ASC`,
        );
      }
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map(rowToWallet);
  }

  async archive(
    tenantId: string,
    walletId: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`UPDATE budgeting.wallets
            SET archived_at = now()
            WHERE id = ${walletId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "wallet",
        entityId: walletId,
        action: "update",
        actorUserId: uid,
        before: { archivedAt: null },
        after: { archivedAt: new Date().toISOString() },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "wallet",
        aggregateId: walletId,
        eventType: "budgeting.wallet.archived",
        payload: { actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }

  /**
   * setBalance — overwrites current_balance to the absolute value.
   * Enforces WALT-04: rejects if the supplied currency differs from the
   * wallet's currency. No row in dropped `account_balance_adjustments`.
   * Writes audit + outbox events.
   */
  async setBalance(
    tenantId: string,
    walletId: string,
    amount: { amount: string; currency: string },
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const before = await tx.execute<{
        currency: string;
        current_balance: string;
      }>(
        sql`SELECT currency, current_balance::text
            FROM budgeting.wallets
            WHERE id = ${walletId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      const beforeRow = (before as any).rows?.[0] ?? (before as any)[0];
      if (!beforeRow) {
        throw new Error("Wallet not found");
      }
      if (beforeRow.currency !== amount.currency) {
        throw new Error(
          `Balance currency ${amount.currency} != wallet currency ${beforeRow.currency} (WALT-04 immutable)`,
        );
      }

      await tx.execute(
        sql`UPDATE budgeting.wallets
            SET current_balance = ${amount.amount}::numeric
            WHERE id = ${walletId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "wallet",
        entityId: walletId,
        action: "update",
        actorUserId: uid,
        before: { currentBalance: beforeRow.current_balance },
        after: { currentBalance: amount.amount, currency: amount.currency },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "wallet",
        aggregateId: walletId,
        eventType: "budgeting.wallet.balance_set",
        payload: {
          currentBalance: amount.amount,
          currency: amount.currency,
          actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }
}
