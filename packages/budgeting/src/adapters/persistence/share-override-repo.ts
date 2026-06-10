/**
 * share-override-repo.ts — Drizzle adapter for ShareOverrideRepo
 * DELETE all + INSERT all pattern inside DEFERRABLE tx (trigger fires at COMMIT).
 * T-2-05-01: sum-100 enforced at DB level — cannot be bypassed at app layer.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, ok, err } from "@budget/shared-kernel";
import type {
  ShareOverrideRepo,
  SetShareOverridesInput,
  ShareOverrideDto,
} from "../../ports/share-override-repo";
import type { Result } from "@budget/shared-kernel";

export class DrizzleShareOverrideRepo implements ShareOverrideRepo {
  async setOverrides(
    input: SetShareOverridesInput,
  ): Promise<Result<ShareOverrideDto[], Error>> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // DELETE all existing overrides for this category
      await tx.execute(sql`
        DELETE FROM budgeting.category_share_overrides
        WHERE category_id = ${input.categoryId}::uuid
          AND tenant_id = ${input.tenantId}::uuid
      `);

      // INSERT all new entries (DEFERRABLE trigger validates sum at COMMIT)
      for (const entry of input.entries) {
        await tx.execute(sql`
          INSERT INTO budgeting.category_share_overrides
            (category_id, user_id, tenant_id, percentage)
          VALUES (${input.categoryId}::uuid, ${entry.userId}::uuid, ${input.tenantId}::uuid, ${entry.percentage}::numeric)
          ON CONFLICT (category_id, user_id)
          DO UPDATE SET percentage = EXCLUDED.percentage, updated_at = now()
        `);
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category_share_overrides",
        entityId: input.categoryId,
        action: "update",
        actorUserId: uid,
        before: null,
        after: { entries: input.entries },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category_share_overrides",
        aggregateId: input.categoryId,
        eventType: "budgeting.shares.updated",
        payload: {
          categoryId: input.categoryId,
          entries: input.entries,
          actorUserId: input.actorUserId,
        },
      });

      return input.entries.map((e) => ({
        categoryId: input.categoryId,
        userId: e.userId,
        percentage: e.percentage,
      })) satisfies ShareOverrideDto[];
    });

    if (r.isErr()) return err(r.error);
    return ok(r.value!);
  }

  async listOverrides(
    tenantId: string,
    categoryId: string,
  ): Promise<ShareOverrideDto[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        category_id: string;
        user_id: string;
        percentage: string;
      }>(sql`
        SELECT category_id::text, user_id::text, percentage::text
        FROM budgeting.category_share_overrides
        WHERE category_id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid
        ORDER BY user_id
      `);
      return result.rows.map((r) => ({
        categoryId: r.category_id,
        userId: r.user_id,
        percentage: r.percentage,
      }));
    });

    if (r.isErr()) throw r.error;
    return r.value!;
  }
}
