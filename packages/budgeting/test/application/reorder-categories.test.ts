/**
 * reorder-categories.test.ts — Unit tests for reorderCategories application service.
 * TDD RED phase — written before implementation.
 */
import { describe, it, expect } from "bun:test";
import { reorderCategories } from "../../src/application/reorder-categories";
import type { CategoryRepo } from "../../src/ports/category-repo";

function makeRepo(
  overrides: Partial<Pick<CategoryRepo, "reorder">> = {},
): CategoryRepo {
  return {
    create: async () => {},
    findById: async () => null,
    list: async () => [],
    listForBudget: async () => [],
    archive: async () => {},
    rename: async () => {},
    reorder: async () => {},
    ...overrides,
  } as unknown as CategoryRepo;
}

describe("reorderCategories", () => {
  it("returns ok(undefined) for valid orderedIds — repo.reorder called with same args", async () => {
    let called = false;
    let capturedArgs: unknown;
    const repo = makeRepo({
      reorder: async (tenantId, budgetId, orderedIds, actorUserId) => {
        called = true;
        capturedArgs = { tenantId, budgetId, orderedIds, actorUserId };
      },
    });
    const svc = reorderCategories({ repo });
    const result = await svc({
      tenantId: "tenant-1",
      budgetId: "budget-1",
      orderedIds: ["a", "b", "c"],
      actorUserId: "user-1",
    });
    expect(result.isOk()).toBe(true);
    expect(called).toBe(true);
    expect(capturedArgs).toEqual({
      tenantId: "tenant-1",
      budgetId: "budget-1",
      orderedIds: ["a", "b", "c"],
      actorUserId: "user-1",
    });
  });

  it("returns err on empty orderedIds — repo.reorder NOT called", async () => {
    let called = false;
    const repo = makeRepo({
      reorder: async () => {
        called = true;
      },
    });
    const svc = reorderCategories({ repo });
    const result = await svc({
      tenantId: "t",
      budgetId: "b",
      orderedIds: [],
      actorUserId: "u",
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toBe("orderedIds_empty");
    expect(called).toBe(false);
  });

  it("returns err on duplicate ids — repo.reorder NOT called", async () => {
    let called = false;
    const repo = makeRepo({
      reorder: async () => {
        called = true;
      },
    });
    const svc = reorderCategories({ repo });
    const result = await svc({
      tenantId: "t",
      budgetId: "b",
      orderedIds: ["a", "b", "a"],
      actorUserId: "u",
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toBe("duplicate_ids");
    expect(called).toBe(false);
  });

  it("returns err when repo.reorder throws", async () => {
    const repo = makeRepo({
      reorder: async () => {
        throw new Error("db_error");
      },
    });
    const svc = reorderCategories({ repo });
    const result = await svc({
      tenantId: "t",
      budgetId: "b",
      orderedIds: ["a", "b"],
      actorUserId: "u",
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toBe("db_error");
  });
});
