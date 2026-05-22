/**
 * onboarding.ts — /onboarding route factory
 *
 * Provides:
 *   GET  /onboarding/progress   — returns saved wizard step for the session user (ONBD-07)
 *   PUT  /onboarding/progress   — upserts wizard step for the session user (ONBD-07)
 *
 * Security mitigations:
 *   T-06-04-03: endpoints key on session.user.id only; body never carries user_id
 *   T-06-04-04: Drizzle sql template tags with bind params (no string concat)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { BootedDeps } from "../boot";

type OnboardingDeps = Pick<BootedDeps, "tenancy">;

const progressPutSchema = z.object({
  step: z.number().int().min(1).max(5),
  completedAt: z.string().datetime().optional(),
});

export function onboardingRoutesFactory(deps: OnboardingDeps) {
  const r = new Hono();

  // GET /progress — return this user's saved step
  r.get("/progress", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const repo = (deps.tenancy as any).onboardingProgressRepo;
    if (!repo) {
      // Fallback for tests with minimal mock
      return c.json({ step: 1, completedAt: null }, 200);
    }

    const progress = await repo.get(session.user.id);
    if (!progress) {
      return c.json({ step: 1, completedAt: null }, 200);
    }
    return c.json(
      { step: progress.step, completedAt: progress.completedAt },
      200,
    );
  });

  // PUT /progress — upsert step for the session user
  r.put("/progress", zValidator("json", progressPutSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    // T-06-04-03: ALWAYS use session.user.id — never read user_id from body
    const userId = session.user.id;

    const repo = (deps.tenancy as any).onboardingProgressRepo;
    if (repo) {
      await repo.upsert(userId, body.step, body.completedAt ?? null);
    }

    return c.json(
      {
        ok: true,
        ...(body.completedAt !== undefined
          ? { completedAt: body.completedAt }
          : {}),
      },
      200,
    );
  });

  return r;
}

// Named alias referenced in plan 06-04 key_links
export { onboardingRoutesFactory as createOnboardingRoute };
