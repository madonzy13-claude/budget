/**
 * budget-mode-repo.ts — Drizzle adapter for BudgetModeRepo (SCD-2)
 * Same effective-dated pattern as category_limits.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, ok, err } from "@budget/shared-kernel";
import type {
  BudgetModeRepo,
  ToggleBudgetModeInput,
  BudgetModeDto,
  BudgetMode,
} from "../../ports/budget-mode-repo";
import type { Result } from "@budget/shared-kernel";

function toDateStr(v: string | Date | null): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.substring(0, 10);
  return v.toISOString().substring(0, 10);
}

export class DrizzleBudgetModeRepo implements BudgetModeRepo {
  async toggleMode(
    input: ToggleBudgetModeInput,
  ): Promise<Result<BudgetModeDto, Error>> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);
    const newId = crypto.randomUUID();

    const r = await withTenantTx(tid, uid, async (tx) => {
      // Snapshot previous open row
      const before = await tx.execute<{
        id: string;
        mode: string;
        effective_from: string;
      }>(sql`
        SELECT id::text, mode, effective_from::text
        FROM budgeting.budget_mode_history
        WHERE budget_id = ${input.workspaceId}::uuid AND effective_to IS NULL
      `);

      if (before.rows.length > 0) {
        const prevFrom = before.rows[0].effective_from.substring(0, 10);
        if (prevFrom === input.effectiveFrom) {
          // Same day: update in place
          await tx.execute(sql`
            UPDATE budgeting.budget_mode_history
            SET mode = ${input.mode}, actor_user_id = ${input.actorUserId}::uuid
            WHERE budget_id = ${input.workspaceId}::uuid AND effective_to IS NULL
          `);
        } else {
          // Close previous row
          await tx.execute(sql`
            UPDATE budgeting.budget_mode_history
            SET effective_to = ${input.effectiveFrom}::date - INTERVAL '1 day'
            WHERE budget_id = ${input.workspaceId}::uuid AND effective_to IS NULL
          `);
          // Insert new open-ended row
          await tx.execute(sql`
            INSERT INTO budgeting.budget_mode_history
              (id, budget_id, tenant_id, mode, effective_from, actor_user_id)
            VALUES (${newId}::uuid, ${input.workspaceId}::uuid, ${input.tenantId}::uuid,
                    ${input.mode}, ${input.effectiveFrom}::date, ${input.actorUserId}::uuid)
          `);
        }
      } else {
        await tx.execute(sql`
          INSERT INTO budgeting.budget_mode_history
            (id, budget_id, tenant_id, mode, effective_from, actor_user_id)
          VALUES (${newId}::uuid, ${input.workspaceId}::uuid, ${input.tenantId}::uuid,
                  ${input.mode}, ${input.effectiveFrom}::date, ${input.actorUserId}::uuid)
        `);
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "workspace_budget_mode",
        entityId: input.workspaceId,
        action: "update",
        actorUserId: uid,
        before: before.rows[0] ?? null,
        after: { mode: input.mode, effectiveFrom: input.effectiveFrom },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "workspace",
        aggregateId: input.workspaceId,
        eventType: "budgeting.mode.changed",
        payload: {
          mode: input.mode,
          effectiveFrom: input.effectiveFrom,
          actorUserId: input.actorUserId,
        },
      });

      // Sync tenancy.budgets.cushion_mode_enabled in the same tx so the boolean
      // never diverges from the SCD-2 history (T-06-02-03 mitigation).
      await tx.execute(sql`
        UPDATE tenancy.budgets
           SET cushion_mode_enabled = ${input.mode === "CUSHION"}
         WHERE id = ${input.workspaceId}::uuid
      `);

      // Fetch the final state to return
      const final = await tx.execute<{
        id: string;
        budget_id: string;
        mode: string;
        effective_from: Date;
        effective_to: Date | null;
        created_at: Date;
      }>(sql`
        SELECT id::text, budget_id::text, mode, effective_from, effective_to, created_at
        FROM budgeting.budget_mode_history
        WHERE budget_id = ${input.workspaceId}::uuid AND effective_to IS NULL
        LIMIT 1
      `);

      const row = final.rows[0]!;
      return {
        id: row.id,
        workspaceId: row.budget_id,
        mode: row.mode as BudgetMode,
        effectiveFrom: toDateStr(row.effective_from)!,
        effectiveTo: toDateStr(row.effective_to),
        createdAt: new Date(row.created_at).toISOString(),
      } satisfies BudgetModeDto;
    });

    if (r.isErr()) return err(r.error);
    return ok(r.value!);
  }

  async getCurrentMode(
    tenantId: string,
    workspaceId: string,
  ): Promise<BudgetModeDto | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        budget_id: string;
        mode: string;
        effective_from: Date;
        effective_to: Date | null;
        created_at: Date;
      }>(sql`
        SELECT id::text, budget_id::text, mode, effective_from, effective_to, created_at
        FROM budgeting.budget_mode_history
        WHERE budget_id = ${workspaceId}::uuid
          AND tenant_id = ${tenantId}::uuid
          AND effective_to IS NULL
        LIMIT 1
      `);
      return result.rows[0] ?? null;
    });

    if (r.isErr()) throw r.error;
    if (!r.value) return null;

    const row = r.value;
    return {
      id: row.id,
      workspaceId: row.budget_id,
      mode: row.mode as BudgetMode,
      effectiveFrom: toDateStr(row.effective_from)!,
      effectiveTo: toDateStr(row.effective_to),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
