/**
 * onboarding-progress-repo.ts — Drizzle adapter for tenancy.onboarding_progress
 * ONBD-07: USER-SCOPED; every query sets app.current_user_id via withUserContext.
 * No domain imports — adapters only.
 */
import { sql } from "drizzle-orm";
import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import type { OnboardingProgressRepo } from "../../ports/onboarding-progress-repo";

export class DrizzleOnboardingProgressRepo implements OnboardingProgressRepo {
  async get(
    userId: string,
  ): Promise<{ step: number; completedAt: string | null } | null> {
    const r = await withUserContext(UserId(userId), async (tx) => {
      const result = await tx.execute<{
        step: number;
        completed_at: Date | null;
      }>(sql`
        SELECT step, completed_at
        FROM tenancy.onboarding_progress
        WHERE user_id = ${userId}::uuid
      `);
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return {
      step: r.value.step,
      completedAt: r.value.completed_at
        ? r.value.completed_at.toISOString()
        : null,
    };
  }

  async upsert(
    userId: string,
    step: number,
    completedAt?: string | null,
  ): Promise<void> {
    const r = await withUserContext(UserId(userId), async (tx) => {
      await tx.execute(sql`
        INSERT INTO tenancy.onboarding_progress (user_id, step, completed_at)
        VALUES (${userId}::uuid, ${step}, ${completedAt ?? null})
        ON CONFLICT (user_id) DO UPDATE
          SET step = EXCLUDED.step,
              completed_at = EXCLUDED.completed_at
      `);
    });
    if (r.isErr()) throw r.error;
  }
}
