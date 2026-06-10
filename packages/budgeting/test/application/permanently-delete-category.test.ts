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
