/**
 * permanently-delete-category.test.ts — hard-delete use case (fake repo).
 */
import { describe, it, expect } from "bun:test";
import { permanentlyDeleteCategory } from "../../src/application/permanently-delete-category";
import type { CategoryRepo } from "../../src/ports/category-repo";

function fakeRepo(
  over: Partial<CategoryRepo> & { exists?: boolean },
): CategoryRepo {
  const calls: string[] = [];
  const base = {
    findById: async () =>
      over.exists === false ? null : ({ id: "c1", name: "X" } as any),
    hardDelete: async (_t: string, id: string) => {
      calls.push(id);
    },
    create: async () => {},
    list: async () => [],
    listForBudget: async () => [],
    archive: async () => {},
    rename: async () => {},
    reorder: async () => {},
  } as unknown as CategoryRepo;
  (base as any).calls = calls;
  return Object.assign(base, over);
}

describe("permanentlyDeleteCategory", () => {
  it("deletes when the category exists → hardDelete called", async () => {
    const repo = fakeRepo({});
    const r = await permanentlyDeleteCategory({ repo })({
      tenantId: "t1",
      categoryId: "c1",
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    expect((repo as any).calls).toContain("c1");
  });

  it("returns not_found for a missing/cross-tenant category", async () => {
    const repo = fakeRepo({ exists: false });
    const r = await permanentlyDeleteCategory({ repo })({
      tenantId: "t1",
      categoryId: "missing",
      actorUserId: "u1",
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toBe("not_found");
    expect((repo as any).calls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 260612-kxd T3-A — integration (real Postgres, CLAUDE.md rule 3):           */
/* hard-deleting a category with an open recurring draft must RESOLVE the     */
/* draft's PENDING CONFIRM_DRAFT task in the SAME transaction. Today          */
/* category-repo.hardDelete purges expense_ledger but never touches           */
/* budgeting.tasks → the "Maczfit" orphan banner task. RED until fixed.       */
/* -------------------------------------------------------------------------- */
const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (DB_URL_RAW) {
  // Docker hostname → localhost so the host-side test runner reaches the DB.
  process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
}

describe.skipIf(!DB_URL_RAW)(
  "permanentlyDeleteCategory — CONFIRM_DRAFT atomicity (real Postgres)",
  () => {
    it("resolves the draft's PENDING CONFIRM_DRAFT task in the same call (no second poll)", async () => {
      const { resetPools } = await import("@budget/platform");
      resetPools();
      const { DrizzleCategoryRepo } = await import(
        "../../src/adapters/persistence/category-repo"
      );
      const { seedDraftWithTask, readTaskStatus, draftRowExists } =
        await import("../draft-task-fixtures");

      const fx = await seedDraftWithTask({ archivedCategory: true });

      const svc = permanentlyDeleteCategory({
        repo: new DrizzleCategoryRepo(),
      });
      const r = await svc({
        tenantId: fx.budgetId,
        categoryId: fx.categoryId,
        actorUserId: fx.userId,
      });
      expect(r.isOk()).toBe(true);

      // Draft purged with the category…
      expect(await draftRowExists(fx.budgetId, fx.draftId)).toBe(false);
      // …and its CONFIRM_DRAFT task closed in the same transaction — the
      // banner must never show a task for a draft that no longer exists.
      const task = await readTaskStatus(fx.budgetId, fx.taskId);
      expect(task).not.toBeNull();
      expect(task?.status).toBe("RESOLVED");
      expect(task?.resolved_at).not.toBeNull();
    });
  },
);
