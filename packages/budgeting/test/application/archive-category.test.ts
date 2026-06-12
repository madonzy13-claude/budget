/**
 * archive-category.test.ts — 260612-kxd T3 addendum (archive gap).
 *
 * Archiving a category purges its unconfirmed drafts in the same tx
 * (category-repo.archive, since ccca754) — but until this addendum it never
 * resolved the drafts' PENDING CONFIRM_DRAFT tasks. The live "Maczfit" task
 * survived exactly this way: its category was archived BEFORE the 42501
 * grants fix, the draft purge silently failed, and the task stayed PENDING.
 *
 * Invariant: the banner shows only ACTIONABLE tasks. A CONFIRM_DRAFT task
 * whose category is archived is not actionable (the draft is invisible in
 * the UI — nothing to confirm). Archive must close those tasks atomically,
 * exactly like hardDelete does (T3-A).
 *
 * Real Postgres via DATABASE_URL_APP (CLAUDE.md rule 3 — no DB mocking).
 * The keep-history mode is the critical case: archived_at stays NULL there,
 * so the read-time self-heal can NOT hide the task — the in-tx resolve is
 * the only guard.
 */
import { describe, it, expect } from "bun:test";
import { archiveCategory } from "../../src/application/archive-category";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (DB_URL_RAW) {
  // Docker hostname → localhost so the host-side test runner reaches the DB.
  process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
}

describe.skipIf(!DB_URL_RAW)(
  "archiveCategory — CONFIRM_DRAFT atomicity (real Postgres)",
  () => {
    async function setup() {
      const { resetPools } = await import("@budget/platform");
      resetPools();
      const { DrizzleCategoryRepo } = await import(
        "../../src/adapters/persistence/category-repo"
      );
      const fixtures = await import("../draft-task-fixtures");
      const svc = archiveCategory({ repo: new DrizzleCategoryRepo() });
      return { svc, ...fixtures };
    }

    it("keep-history archive resolves the draft's PENDING CONFIRM_DRAFT task in the same call", async () => {
      const { svc, seedDraftWithTask, readTaskStatus, draftRowExists } =
        await setup();
      const fx = await seedDraftWithTask();

      const r = await svc({
        tenantId: fx.budgetId,
        categoryId: fx.categoryId,
        actorUserId: fx.userId,
        mode: "current_future",
      });
      expect(r.isOk()).toBe(true);

      // Unconfirmed draft purged with the archive…
      expect(await draftRowExists(fx.budgetId, fx.draftId)).toBe(false);
      // …and its CONFIRM_DRAFT task closed in the same transaction. With
      // keep-history archived_at stays NULL, so the banner self-heal cannot
      // hide a leftover PENDING row — the resolve here is the only guard.
      const task = await readTaskStatus(fx.budgetId, fx.taskId);
      expect(task).not.toBeNull();
      expect(task?.status).toBe("RESOLVED");
      expect(task?.resolved_at).not.toBeNull();
    });

    it("hide-all archive (default mode) resolves the task too", async () => {
      const { svc, seedDraftWithTask, readTaskStatus, draftRowExists } =
        await setup();
      const fx = await seedDraftWithTask();

      const r = await svc({
        tenantId: fx.budgetId,
        categoryId: fx.categoryId,
        actorUserId: fx.userId,
      });
      expect(r.isOk()).toBe(true);

      expect(await draftRowExists(fx.budgetId, fx.draftId)).toBe(false);
      // The read self-heal would HIDE the task for an archived_at category,
      // but the row itself must also flip to RESOLVED — statuses stay true
      // to the data (no permanent PENDING ghosts à la the 156 dev orphans).
      const task = await readTaskStatus(fx.budgetId, fx.taskId);
      expect(task).not.toBeNull();
      expect(task?.status).toBe("RESOLVED");
      expect(task?.resolved_at).not.toBeNull();
    });
  },
);
