/**
 * income-repo.ts — Drizzle adapter for budgeting.incomes (r32).
 *
 * Thin CRUD for the Income settings config. Mirrors recurring-rule-repo's
 * tenant-scoped raw-SQL pattern (all queries inside withTenantTx → RLS GUC).
 * Soft-delete (active=false) so a future consumer can reference historical rows.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

export type IncomeCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface IncomeRow {
  id: string;
  tenantId: string;
  name: string;
  amount: string;
  currency: string;
  cadence: IncomeCadence;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  active: boolean;
  createdAt: Date;
  actorUserId: string;
}

export interface IncomeWrite {
  tenantId: string;
  name: string;
  amount: string;
  currency: string;
  cadence: IncomeCadence;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  actorUserId: string;
}

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

function rowToIncome(row: Record<string, unknown>): IncomeRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    amount: String(row.amount),
    currency: (row.currency as string).trim(),
    cadence: row.cadence as IncomeCadence,
    cadenceAnchor: (row.cadence_anchor as number | null) ?? null,
    weeklyDow: (row.weekly_dow as number | null) ?? null,
    yearlyMonth: (row.yearly_month as number | null) ?? null,
    active: Boolean(row.active),
    createdAt: new Date(row.created_at as string),
    actorUserId: row.actor_user_id as string,
  };
}

export class DrizzleIncomeRepo {
  async insert(input: IncomeWrite): Promise<{ id: string }> {
    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const dtx = tx as DrizzleTx;
        const res = await dtx.execute(sql`
          INSERT INTO budgeting.incomes
            (tenant_id, name, amount, currency, cadence,
             cadence_anchor, weekly_dow, yearly_month, active, actor_user_id)
          VALUES
            (${input.tenantId}::uuid, ${input.name}, ${input.amount}::numeric,
             ${input.currency}, ${input.cadence},
             ${input.cadenceAnchor}, ${input.weeklyDow}, ${input.yearlyMonth},
             true, ${input.actorUserId}::uuid)
          RETURNING id
        `);
        return { id: (res.rows[0] as Record<string, unknown>).id as string };
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async listActive(tenantId: string): Promise<IncomeRow[]> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const dtx = tx as DrizzleTx;
        const res = await dtx.execute(sql`
          SELECT * FROM budgeting.incomes
           WHERE tenant_id = ${tenantId}::uuid AND active = true
           ORDER BY created_at ASC
        `);
        return res.rows.map(rowToIncome);
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  /** Full replace of the editable fields (keeps cadence anchors consistent). */
  async update(id: string, input: IncomeWrite): Promise<{ updated: boolean }> {
    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const dtx = tx as DrizzleTx;
        const res = await dtx.execute(sql`
          UPDATE budgeting.incomes
             SET name = ${input.name},
                 amount = ${input.amount}::numeric,
                 currency = ${input.currency},
                 cadence = ${input.cadence},
                 cadence_anchor = ${input.cadenceAnchor},
                 weekly_dow = ${input.weeklyDow},
                 yearly_month = ${input.yearlyMonth},
                 updated_at = now()
           WHERE id = ${id}::uuid AND tenant_id = ${input.tenantId}::uuid
             AND active = true
          RETURNING id
        `);
        return { updated: res.rows.length > 0 };
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async deactivate(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(actorUserId),
      async (tx) => {
        const dtx = tx as DrizzleTx;
        await dtx.execute(sql`
          UPDATE budgeting.incomes
             SET active = false, updated_at = now()
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
        `);
      },
    );
    if (r.isErr()) throw r.error;
  }
}
