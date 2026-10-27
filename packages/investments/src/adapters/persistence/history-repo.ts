/**
 * history-repo.ts — DrizzleHistoryRepo (Phase 13). commit() writes a whole
 * booking — new holding, holding patches, history entries — in ONE
 * withTenantTx, so a failure anywhere leaves nothing behind. Patches are scoped
 * by id AND budget_id; a miss throws not_found and rolls the booking back.
 * bigint cents bound as strings (node-postgres has no native bigint param).
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { insertHoldingTx } from "./holding-repo";
import type {
  BookingPlan,
  FlowRow,
  HistoryKind,
  HistoryRepo,
  RealizedRow,
  StoredEntry,
} from "../../ports/history-repo";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Reads with no acting user (Overview contributions) — same id the budgeting
 *  snapshot/task repos use. */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

const s = (v: bigint | null): string | null =>
  v === null ? null : v.toString();

const ENTRY_SELECT = sql`
  SELECT h.id::text AS id, h.holding_id::text AS holding_id, h.kind,
         h.effective_date::text AS effective_date,
         h.amount_cents::text AS amount_cents, h.amount_currency,
         h.qty_delta::text AS qty_delta,
         h.cost_delta_cents::text AS cost_delta_cents,
         h.value_delta_cents::text AS value_delta_cents,
         h.flow_cents::text AS flow_cents,
         h.realized_budget_cents::text AS realized_budget_cents,
         h.sold_cost_budget_cents::text AS sold_cost_budget_cents,
         h.budget_currency,
         h.prior_principal_cents::text AS prior_principal_cents,
         h.prior_start_date::text AS prior_start_date,
         h.transfer_id::text AS transfer_id, h.created_at,
         h.wallet_id::text AS wallet_id,
         (SELECT w.name FROM budgeting.wallets w WHERE w.id = h.wallet_id) AS wallet_name,
         h.wallet_delta_numeric::text AS wallet_delta_numeric, h.wallet_created,
         h.prior_price_cents::text AS prior_price_cents, h.prior_price_currency,
         h.backfilled,
         cp.name AS counterparty_name, cp.holding_id AS counterparty_holding_id
    FROM budgeting.investment_history h
    LEFT JOIN LATERAL (
      SELECT i.name, o.holding_id::text AS holding_id
        FROM budgeting.investment_history o
        JOIN budgeting.investments i ON i.id = o.holding_id
       WHERE o.transfer_id = h.transfer_id AND o.id <> h.id
         AND o.deleted_at IS NULL
       LIMIT 1) cp ON true`;

const big = (v: unknown): bigint | null =>
  v === null || v === undefined ? null : BigInt(String(v));

function mapEntry(row: Record<string, unknown>): StoredEntry {
  return {
    id: String(row.id),
    holdingId: String(row.holding_id),
    kind: String(row.kind) as HistoryKind,
    effectiveDate: String(row.effective_date),
    amountCents: big(row.amount_cents),
    amountCurrency: (row.amount_currency as string | null) ?? null,
    // numeric(28,8) → trim trailing zeros so "−0.10000000" reads "-0.1"
    qtyDelta:
      row.qty_delta == null
        ? null
        : String(row.qty_delta)
            .replace(/(\.\d*?)0+$/, "$1")
            .replace(/\.$/, ""),
    costDeltaCents: big(row.cost_delta_cents) ?? 0n,
    valueDeltaCents: big(row.value_delta_cents) ?? 0n,
    flowCents: big(row.flow_cents) ?? 0n,
    realizedBudgetCents: big(row.realized_budget_cents),
    soldCostBudgetCents: big(row.sold_cost_budget_cents),
    budgetCurrency: (row.budget_currency as string | null) ?? null,
    priorPrincipalCents: big(row.prior_principal_cents),
    priorStartDate: (row.prior_start_date as string | null) ?? null,
    transferId: (row.transfer_id as string | null) ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    counterpartyName: (row.counterparty_name as string | null) ?? null,
    counterpartyHoldingId:
      (row.counterparty_holding_id as string | null) ?? null,
    walletId: (row.wallet_id as string | null) ?? null,
    walletName: (row.wallet_name as string | null) ?? null,
    walletDeltaNumeric: (row.wallet_delta_numeric as string | null) ?? null,
    walletCreated: row.wallet_created === true,
    priorPriceCents: (row.prior_price_cents as string | null) ?? null,
    priorPriceCurrency: (row.prior_price_currency as string | null) ?? null,
    backfilled: row.backfilled === true,
  };
}

/** Newest live entry: the D-14 rule (effective_date, created_at, id). */
const NEWEST = sql`ORDER BY h.effective_date DESC, h.created_at DESC, h.id DESC LIMIT 1`;

const ids = (list: string[]) =>
  sql.join(
    list.map((i) => sql`${i}::uuid`),
    sql`, `,
  );

/** pg unique violation (label index) → domain code. */
const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

export class DrizzleHistoryRepo implements HistoryRepo {
  async commit(
    tenantId: string,
    userId: string,
    plan: BookingPlan,
  ): Promise<{
    newHoldingId: string | null;
    transferId: string | null;
    walletId: string | null;
    walletType: string | null;
  }> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;

        // 1) Lock every touched asset row, in id order (no deadlocks), THEN
        //    re-check what the plan was built on (D-14/D-15 under concurrency).
        const lock = [
          ...new Set([
            ...(plan.lockHoldingIds ?? []),
            ...plan.patches.map((p) => p.id),
            ...(plan.renameHolding ? [plan.renameHolding.id] : []),
            ...(plan.restorePrice ? [plan.restorePrice.id] : []),
          ]),
        ].sort();
        if (lock.length)
          await dt.execute(sql`
            SELECT id FROM budgeting.investments
             WHERE id IN (${ids(lock)}) AND budget_id = ${plan.budgetId}::uuid
             ORDER BY id FOR UPDATE
          `);
        const newest = async (holdingId: string) =>
          (
            await dt.execute(sql`
              SELECT h.id::text AS id, h.effective_date::text AS d
                FROM budgeting.investment_history h
               WHERE h.holding_id = ${holdingId}::uuid AND h.deleted_at IS NULL
               ${NEWEST}
            `)
          ).rows[0] as { id: string; d: string } | undefined;
        for (const x of plan.expectedNewestEntryId ?? [])
          if (((await newest(x.holdingId))?.id ?? null) !== x.entryId)
            throw new Error("stale");
        for (const x of plan.minEffectiveDate ?? []) {
          const top = await newest(x.holdingId);
          if (top && x.date < top.d) throw new Error("before_latest_entry");
        }

        // 2) Label change (D-07): the unique index is the race-safe check.
        if (plan.renameHolding) {
          await dt.execute(sql`SAVEPOINT rename_holding`);
          try {
            const res = await dt.execute(sql`
              UPDATE budgeting.investments SET name = ${plan.renameHolding.name.trim()}
               WHERE id = ${plan.renameHolding.id}::uuid AND budget_id = ${plan.budgetId}::uuid
              RETURNING id
            `);
            if (res.rows.length === 0) throw new Error("not_found");
            await dt.execute(sql`RELEASE SAVEPOINT rename_holding`);
          } catch (e) {
            if (isUniqueViolation(e)) throw new Error("label_taken");
            throw e;
          }
        }
        if (plan.restorePrice) {
          const res = await dt.execute(sql`
            UPDATE budgeting.investments
               SET current_price_cents = ${plan.restorePrice.priceCents}::numeric,
                   current_price_currency = ${plan.restorePrice.currency}
             WHERE id = ${plan.restorePrice.id}::uuid AND budget_id = ${plan.budgetId}::uuid
            RETURNING id
          `);
          if (res.rows.length === 0) throw new Error("not_found");
        }

        const newHoldingId = plan.newHolding
          ? (
              await insertHoldingTx(
                tx,
                tenantId,
                plan.budgetId,
                plan.newHolding,
              )
            ).id
          : null;

        for (const p of plan.patches) {
          const res = await dt.execute(sql`
            UPDATE budgeting.investments SET
              quantity = COALESCE(${p.quantity ?? null}::numeric, quantity),
              buy_price_cents = COALESCE(${s(p.buyPriceCents ?? null)}::bigint, buy_price_cents),
              current_price_cents = CASE WHEN ${p.currentPriceCents !== undefined}
                                         THEN ${p.currentPriceCents == null ? null : String(p.currentPriceCents)}::numeric
                                         ELSE current_price_cents END,
              current_price_currency = CASE WHEN ${p.currentPriceCurrency !== undefined}
                                            THEN ${p.currentPriceCurrency ?? null}
                                            ELSE current_price_currency END,
              deposit_start_date = COALESCE(${p.depositStartDate ?? null}::date, deposit_start_date),
              archived_at = CASE WHEN ${!!p.archive} THEN now()
                                 WHEN ${!!p.unarchive} THEN NULL
                                 ELSE archived_at END
             WHERE id = ${p.id}::uuid AND budget_id = ${plan.budgetId}::uuid
            RETURNING id
          `);
          if (res.rows.length === 0) throw new Error("not_found");
        }

        const wallet = plan.walletCredit
          ? await this.creditWallet(dt, tenantId, userId, plan.walletCredit)
          : { walletId: null, walletType: null };

        for (const id of plan.softDeleteEntryIds ?? [])
          await dt.execute(sql`
            UPDATE budgeting.investment_history SET deleted_at = now()
             WHERE id = ${id}::uuid AND budget_id = ${plan.budgetId}::uuid
               AND deleted_at IS NULL
          `);
        for (const id of plan.deleteHoldingIds ?? []) {
          const res = await dt.execute(sql`
            DELETE FROM budgeting.investments
             WHERE id = ${id}::uuid AND budget_id = ${plan.budgetId}::uuid
            RETURNING id
          `);
          if (res.rows.length === 0) throw new Error("not_found");
        }

        const transferId = plan.entries.some((e) => e.transfer)
          ? String(
              (await dt.execute(sql`SELECT gen_random_uuid()::text AS id`))
                .rows[0]!.id,
            )
          : null;

        for (const e of plan.entries) {
          const holdingId =
            e.holdingRef === "$new" ? newHoldingId : e.holdingRef;
          if (!holdingId) throw new Error("not_found");
          await dt.execute(sql`
            INSERT INTO budgeting.investment_history
              (tenant_id, budget_id, holding_id, kind, effective_date,
               amount_cents, amount_currency, qty_delta,
               cost_delta_cents, cost_currency, value_delta_cents,
               flow_cents, flow_currency,
               sold_cost_budget_cents, realized_budget_cents, budget_currency,
               prior_principal_cents, prior_start_date, transfer_id,
               wallet_id, wallet_delta_numeric, wallet_created,
               prior_price_cents, prior_price_currency, backfilled)
            VALUES
              (${tenantId}::uuid, ${plan.budgetId}::uuid, ${holdingId}::uuid,
               ${e.kind}, ${e.effectiveDate}::date,
               ${s(e.amountCents)}::bigint, ${e.amountCurrency}, ${e.qtyDelta}::numeric,
               ${s(e.costDeltaCents)}::bigint, ${e.costCurrency}, ${s(e.valueDeltaCents)}::bigint,
               ${s(e.flowCents)}::bigint, ${e.flowCurrency},
               ${s(e.soldCostBudgetCents)}::bigint, ${s(e.realizedBudgetCents)}::bigint,
               ${e.budgetCurrency},
               ${s(e.priorPrincipalCents)}::bigint, ${e.priorStartDate}::date,
               ${e.transfer ? transferId : null}::uuid,
               ${e.walletId === "$newWallet" ? wallet.walletId : e.walletId}::uuid,
               ${e.walletDeltaNumeric}::numeric, ${e.walletCreated},
               ${e.priorPriceCents}::numeric, ${e.priorPriceCurrency}, ${e.backfilled})
          `);
        }
        return { newHoldingId, transferId, ...wallet };
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  /**
   * D-21 wallet delta inside the booking tx. Investments must not import the
   * budgeting context, so this is raw SQL with the same audit + outbox rows a
   * manual balance write produces (wallet-repo create / setBalance).
   */
  private async creditWallet(
    dt: DrizzleTx,
    tenantId: string,
    userId: string,
    c: NonNullable<BookingPlan["walletCredit"]>,
  ): Promise<{ walletId: string | null; walletType: string | null }> {
    const tid = TenantId(tenantId);
    const uid = UserId(userId);
    if ("create" in c.target) {
      const w = c.target.create;
      if (w.currency !== c.currency)
        throw new Error("wallet_currency_mismatch");
      const res = await dt.execute(sql`
        INSERT INTO budgeting.wallets
          (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order)
        VALUES
          (gen_random_uuid(), ${tenantId}::uuid, ${w.name}, ${w.walletType}, ${w.currency},
           ${c.amountMajor}::numeric, now(), ${userId}::uuid,
           (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM budgeting.wallets
             WHERE tenant_id = ${tenantId}::uuid AND wallet_type = ${w.walletType}))
        RETURNING id::text AS id
      `);
      const id = String(res.rows[0]!.id);
      await writeAudit(dt, {
        tenantId: tid,
        entityType: "wallet",
        entityId: id,
        action: "create",
        actorUserId: uid,
        before: null,
        after: { name: w.name, walletType: w.walletType, currency: w.currency },
      });
      await writeOutbox(dt, {
        tenantId: tid,
        aggregateType: "wallet",
        aggregateId: id,
        eventType: "budgeting.wallet.created",
        payload: {
          walletType: w.walletType,
          currency: w.currency,
          actorUserId: userId,
        },
      });
      return { walletId: id, walletType: w.walletType };
    }
    const walletId = c.target.walletId;
    const sign = c.reverse ? sql`-` : sql`+`;
    // Undo ignores archived (the sale already happened); credit refuses it.
    const res = await dt.execute(sql`
      UPDATE budgeting.wallets
         SET current_balance = current_balance ${sign} ${c.amountMajor}::numeric
       WHERE id = ${walletId}::uuid AND tenant_id = ${tenantId}::uuid
         ${c.reverse ? sql`` : sql`AND archived_at IS NULL`}
      RETURNING currency, wallet_type, current_balance::text AS after,
                (current_balance ${c.reverse ? sql`+` : sql`-`} ${c.amountMajor}::numeric)::text AS before
    `);
    const row = res.rows[0] as
      | { currency: string; wallet_type: string; after: string; before: string }
      | undefined;
    if (!row) {
      // D-24: a deleted wallet never blocks undoing the sale.
      if (c.reverse) return { walletId: null, walletType: null };
      throw new Error("not_found");
    }
    if (row.currency.trim() !== c.currency)
      throw new Error("wallet_currency_mismatch");
    await writeAudit(dt, {
      tenantId: tid,
      entityType: "wallet",
      entityId: walletId,
      action: "update",
      actorUserId: uid,
      before: { currentBalance: row.before },
      after: { currentBalance: row.after, currency: row.currency },
    });
    await writeOutbox(dt, {
      tenantId: tid,
      aggregateType: "wallet",
      aggregateId: walletId,
      eventType: "budgeting.wallet.balance_set",
      payload: {
        currentBalance: row.after,
        currency: row.currency,
        actorUserId: userId,
      },
    });
    return { walletId, walletType: row.wallet_type };
  }

  async newestFor(
    tenantId: string,
    userId: string,
    holdingIds: string[],
  ): Promise<Map<string, StoredEntry | null>> {
    const out = new Map<string, StoredEntry | null>(
      holdingIds.map((id) => [id, null]),
    );
    if (!holdingIds.length) return out;
    return this.read(tenantId, userId, async (dt) => {
      // ponytail: one query per asset; callers pass 1-2 ids.
      for (const id of holdingIds) {
        const r = await dt.execute(sql`
          ${ENTRY_SELECT}
           WHERE h.deleted_at IS NULL AND h.holding_id = ${id}::uuid
           ${NEWEST}
        `);
        out.set(id, r.rows[0] ? mapEntry(r.rows[0]) : null);
      }
      return out;
    });
  }

  private async read<T>(
    tenantId: string,
    userId: string,
    fn: (dt: DrizzleTx) => Promise<T>,
  ): Promise<T> {
    const r = await withTenantTx(TenantId(tenantId), UserId(userId), (tx) =>
      fn(tx as DrizzleTx),
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async findLegs(
    tenantId: string,
    userId: string,
    entryId: string,
  ): Promise<StoredEntry[]> {
    return this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        ${ENTRY_SELECT}
         WHERE h.deleted_at IS NULL
           AND (h.id = ${entryId}::uuid
                OR h.transfer_id = (SELECT transfer_id FROM budgeting.investment_history
                                     WHERE id = ${entryId}::uuid AND deleted_at IS NULL))
      `);
      return res.rows.map(mapEntry);
    });
  }

  async listForHolding(
    tenantId: string,
    userId: string,
    holdingId: string,
  ): Promise<StoredEntry[]> {
    return this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        ${ENTRY_SELECT}
         WHERE h.deleted_at IS NULL AND h.holding_id = ${holdingId}::uuid
         ORDER BY h.effective_date, h.created_at, h.id
      `);
      return res.rows.map(mapEntry);
    });
  }

  async realizedByType(
    tenantId: string,
    userId: string,
    budgetId: string,
  ): Promise<RealizedRow[]> {
    return this.read(tenantId, userId, async (dt) => {
      // Archived holdings included: a type keeps its realized after its last
      // holding is sold (D-14). Keyed by the holding's CURRENT ui_type.
      const res = await dt.execute(sql`
        SELECT COALESCE(i.ui_type, 'other') AS ui_type,
               COALESCE(h.budget_currency, '') AS budget_currency,
               COALESCE(sum(h.realized_budget_cents), 0)::text AS realized,
               COALESCE(sum(h.sold_cost_budget_cents), 0)::text AS sold_cost
          FROM budgeting.investment_history h
          JOIN budgeting.investments i ON i.id = h.holding_id
         WHERE h.budget_id = ${budgetId}::uuid AND h.deleted_at IS NULL
           AND h.kind IN ('withdraw', 'convert_out')
         GROUP BY 1, 2
      `);
      return res.rows.map((row) => ({
        uiType: String(row.ui_type),
        budgetCurrency: String(row.budget_currency),
        realizedBudgetCents: BigInt(String(row.realized)),
        soldCostBudgetCents: BigInt(String(row.sold_cost)),
      }));
    });
  }

  async getTypeOrder(
    tenantId: string,
    userId: string,
    budgetId: string,
  ): Promise<string[]> {
    return this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        SELECT investment_type_order AS o FROM tenancy.budgets
         WHERE id = ${budgetId}::uuid
      `);
      return (res.rows[0]?.o as string[] | undefined) ?? [];
    });
  }

  async setTypeOrder(
    tenantId: string,
    userId: string,
    budgetId: string,
    order: string[],
  ): Promise<void> {
    await this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        UPDATE tenancy.budgets
           SET investment_type_order = ${`{${order.join(",")}}`}::text[]
         WHERE id = ${budgetId}::uuid
        RETURNING id
      `);
      if (res.rows.length === 0) throw new Error("not_found");
    });
  }

  async listFlows(tenantId: string, budgetId: string): Promise<FlowRow[]> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const res = await (tx as DrizzleTx).execute(sql`
          SELECT effective_date::text AS effective_date,
                 flow_cents::text AS flow_cents,
                 COALESCE(flow_currency, amount_currency, cost_currency) AS flow_currency
            FROM budgeting.investment_history
           WHERE budget_id = ${budgetId}::uuid AND deleted_at IS NULL
           ORDER BY effective_date
        `);
        return res.rows.map((row) => ({
          effectiveDate: String(row.effective_date),
          flowCents: BigInt(String(row.flow_cents)),
          flowCurrency: String(row.flow_currency ?? ""),
        }));
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }
}
