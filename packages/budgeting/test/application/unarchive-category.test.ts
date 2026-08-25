/**
 * unarchive-category.test.ts — TDD RED: failing tests for unarchiveCategory use-case.
 * bun:test with fake repos.
 */
import { describe, it, expect } from "bun:test";
import type { CategoryRepo } from "../../src/ports/category-repo";
import type { CategoryLimitRepo } from "../../src/ports/category-limit-repo";

// Fake category domain object
function makeCategory(
  id: string,
  archivedFrom: string | null = null,
  archivedAt: Date | null = null,
): any {
  return {
    id,
    tenantId: "tenant-1",
    name: "Test",
    parentId: null,
    archivedAt,
    createdAt: new Date("2026-01-01"),
    actorUserId: "user-1",
    isArchived: () => archivedAt !== null,
    // Adapter attaches archivedFrom as plain property
    archivedFrom,
  };
}

function makeFakeLimitRow(
  normalAmount: string,
  normalCurrency: string,
  cushionAmount: string,
  cushionCurrency: string,
) {
  return {
    id: "lim-1",
    tenantId: "tenant-1",
    categoryId: "cat-1",
    normalAmount,
    normalCurrency,
    cushionAmount,
    cushionCurrency,
    effectiveFrom: "2026-03-01",
    effectiveTo: null,
    actorUserId: "user-1",
    createdAt: new Date("2026-03-01"),
  };
}

function makeRepos(
  catOrNull: any | null,
  limitRow: any | null = null,
): {
  repo: CategoryRepo & { unarchiveCalls: any[] };
  limitRepo: CategoryLimitRepo & { setLimitCalls: any[] };
} {
  const unarchiveCalls: any[] = [];
  const setLimitCalls: any[] = [];

  const repo = {
    findById: async () => catOrNull,
    list: async () => [],
    listForBudget: async () => [],
    create: async () => {},
    archive: async () => {},
    rename: async () => {},
    hardDelete: async () => {},
    reorder: async () => {},
    unarchive: async (...args: any[]) => {
      unarchiveCalls.push(args);
    },
    unarchiveCalls,
  } as unknown as CategoryRepo & { unarchiveCalls: any[] };

  const limitRepo = {
    setLimit: async () => {},
    setLimitForMonth: async (input: any) => {
      setLimitCalls.push(input);
    },
    getEffectiveLimit: async () => limitRow,
    listForCategory: async () => [],
    effectiveForMonth: async () => new Map(),
    setLimitCalls,
  } as unknown as CategoryLimitRepo & { setLimitCalls: any[] };

  return { repo, limitRepo };
}

describe("unarchiveCategory", () => {
  it("returns err when category not found", async () => {
    const { unarchiveCategory } =
      await import("../../src/application/unarchive-category");
    const { repo, limitRepo } = makeRepos(null);
    const useCase = unarchiveCategory({ repo, limitRepo });
    const result = await useCase({
      tenantId: "tenant-1",
      categoryId: "cat-1",
      actorUserId: "user-1",
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain("not found");
  });

  it("returns err when category is NOT archived (both flags null)", async () => {
    const { unarchiveCategory } =
      await import("../../src/application/unarchive-category");
    // archivedFrom=null + archivedAt=null = not archived
    const cat = makeCategory("cat-1", null, null);
    const { repo, limitRepo } = makeRepos(cat);
    const useCase = unarchiveCategory({ repo, limitRepo });
    const result = await useCase({
      tenantId: "tenant-1",
      categoryId: "cat-1",
      actorUserId: "user-1",
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toMatch(/not archived/i);
  });

  it("SAME-MONTH revert: calls repo.unarchive once, does NOT call setLimitForMonth", async () => {
    const { unarchiveCategory } =
      await import("../../src/application/unarchive-category");
    // archived_from = current month (2026-06-01); today is also 2026-06
    const now = new Date();
    const currentMonthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const cat = makeCategory("cat-1", currentMonthStart, null);
    const { repo, limitRepo } = makeRepos(cat, null);
    const useCase = unarchiveCategory({ repo, limitRepo });
    const result = await useCase({
      tenantId: "tenant-1",
      categoryId: "cat-1",
      actorUserId: "user-1",
    });
    expect(result.isOk()).toBe(true);
    expect(repo.unarchiveCalls).toHaveLength(1);
    expect(repo.unarchiveCalls[0]).toEqual(["tenant-1", "cat-1", "user-1"]);
    expect(limitRepo.setLimitCalls).toHaveLength(0);
  });

  it("MONTHS-LATER revert: zeroes strictly-between months, sets current month to archive-month limits, calls unarchive once", async () => {
    const { unarchiveCategory } =
      await import("../../src/application/unarchive-category");
    // Months are derived from the REAL clock, never written down. This fixture
    // used to hardcode archive 2026-03-01 and "current" 2026-06-01, with a
    // comment saying "Today is 2026-06-11" — true the day it was written and
    // wrong every month after. By August the strictly-between span had grown
    // from 2 months to 4, so the call count drifted and the month checked for
    // the restored limit had itself become a zeroed in-between month.
    const now = new Date();
    const monthStartBack = (n: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    };
    const currentMonthStart = monthStartBack(0);
    const archiveMonth = monthStartBack(3);
    const between1 = monthStartBack(2);
    const between2 = monthStartBack(1);
    const cat = makeCategory("cat-1", archiveMonth, null);
    const limitRow = makeFakeLimitRow("50000", "EUR", "10000", "EUR");
    const { repo, limitRepo } = makeRepos(cat, limitRow);

    // Override getEffectiveLimit to only return limit for the archive month
    (limitRepo as any).getEffectiveLimit = async (
      _tenantId: string,
      _categoryId: string,
      reportDate: string,
    ) => {
      if (reportDate === archiveMonth) return limitRow;
      return null;
    };

    const useCase = unarchiveCategory({ repo, limitRepo });
    const result = await useCase({
      tenantId: "tenant-1",
      categoryId: "cat-1",
      actorUserId: "user-1",
    });

    expect(result.isOk()).toBe(true);

    const monthStarts = limitRepo.setLimitCalls.map((c: any) => c.monthStart);
    expect(monthStarts).toContain(between1);
    expect(monthStarts).toContain(between2);
    expect(monthStarts).toContain(currentMonthStart);
    // the archive month itself must NOT be in the set
    expect(monthStarts).not.toContain(archiveMonth);

    // Strictly-between entries should have zero amounts
    const apr = limitRepo.setLimitCalls.find(
      (c: any) => c.monthStart === between1,
    );
    expect(apr?.normalAmount).toBe("0");
    expect(apr?.cushionAmount).toBe("0");
    expect(apr?.carryForward).toBe(false);

    const may = limitRepo.setLimitCalls.find(
      (c: any) => c.monthStart === between2,
    );
    expect(may?.normalAmount).toBe("0");
    expect(may?.carryForward).toBe(false);

    // Current month gets archive-month limits
    const jun = limitRepo.setLimitCalls.find(
      (c: any) => c.monthStart === currentMonthStart,
    );
    expect(jun?.normalAmount).toBe("50000");
    expect(jun?.cushionAmount).toBe("10000");
    expect(jun?.normalCurrency).toBe("EUR");
    expect(jun?.carryForward).toBe(false);

    // unarchive called once
    expect(repo.unarchiveCalls).toHaveLength(1);
  });

  it("MONTHS-LATER: total setLimitForMonth calls = (months strictly between) + 1 current", async () => {
    const { unarchiveCategory } =
      await import("../../src/application/unarchive-category");
    // Three months back, so exactly two months fall strictly between —
    // relative to the real clock, for the reason spelled out above.
    const now = new Date();
    const archiveMonth = (() => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    })();
    const cat = makeCategory("cat-1", archiveMonth, null);
    const limitRow = makeFakeLimitRow("50000", "EUR", "10000", "EUR");
    const { repo, limitRepo } = makeRepos(cat, limitRow);
    (limitRepo as any).getEffectiveLimit = async (
      _t: string,
      _c: string,
      d: string,
    ) => (d === archiveMonth ? limitRow : null);

    const useCase = unarchiveCategory({ repo, limitRepo });
    await useCase({
      tenantId: "tenant-1",
      categoryId: "cat-1",
      actorUserId: "user-1",
    });

    // 2 strictly-between + 1 current = 3 calls total
    expect(limitRepo.setLimitCalls.length).toBe(3);
  });
});
