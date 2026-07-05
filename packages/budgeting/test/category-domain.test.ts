/**
 * category-domain.test.ts — Unit tests for Category domain entity (RED phase)
 * TDD: written before implementation per CLAUDE.md mandate.
 * Tests: canBeChild validation, archive guards, one-level grouping invariant.
 */
import { describe, test, expect } from "bun:test";

// Category domain entity — not yet implemented (RED)
import { Category } from "../src/domain/category";

function makeCategory(overrides: Partial<{
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  actorUserId: string;
}> = {}): Category {
  return new Category(
    overrides.id ?? "cat-001",
    overrides.tenantId ?? "tenant-001",
    overrides.name ?? "Food",
    overrides.parentId ?? null,
    overrides.archivedAt ?? null,
    overrides.createdAt ?? new Date("2026-01-01"),
    overrides.actorUserId ?? "user-001",
  );
}

describe("Category domain", () => {
  describe("basic properties", () => {
    test("creates a root category (no parent)", () => {
      const cat = makeCategory({ parentId: null });
      expect(cat.parentId).toBeNull();
      expect(cat.isRoot()).toBe(true);
      expect(cat.isArchived()).toBe(false);
    });

    test("creates a child category (with parent)", () => {
      const cat = makeCategory({ parentId: "cat-000" });
      expect(cat.parentId).toBe("cat-000");
      expect(cat.isRoot()).toBe(false);
    });
  });

  describe("canBeChild()", () => {
    test("returns ok if parent is a root (no parent itself)", () => {
      const parent = makeCategory({ id: "cat-parent", parentId: null });
      const child = makeCategory({ id: "cat-child" });
      const result = child.canBeChild(parent);
      expect(result.isOk()).toBe(true);
    });

    test("returns err if parent is already a child (would create 2nd level)", () => {
      const grandparent = makeCategory({ id: "cat-gp" });
      const parent = makeCategory({ id: "cat-parent", parentId: grandparent.id });
      const child = makeCategory({ id: "cat-child" });
      const result = child.canBeChild(parent);
      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain("one level");
    });
  });

  describe("archive()", () => {
    test("archives an active category", () => {
      const cat = makeCategory();
      const result = cat.archive();
      expect(result.isOk()).toBe(true);
      expect(cat.isArchived()).toBe(true);
      expect(cat.archivedAt).toBeInstanceOf(Date);
    });

    test("returns err if already archived", () => {
      const cat = makeCategory({ archivedAt: new Date("2026-03-01") });
      const result = cat.archive();
      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain("already archived");
    });
  });

  describe("rename()", () => {
    test("renames a category", () => {
      const cat = makeCategory({ name: "Old" });
      const result = cat.rename("New Name");
      expect(result.isOk()).toBe(true);
      expect(cat.name).toBe("New Name");
    });

    test("returns err when renaming archived category", () => {
      const cat = makeCategory({ archivedAt: new Date() });
      const result = cat.rename("New");
      expect(result.isErr()).toBe(true);
    });

    test("returns err when name is blank", () => {
      const cat = makeCategory();
      const result = cat.rename("  ");
      expect(result.isErr()).toBe(true);
    });
  });

  describe("investment category (r33)", () => {
    test("normal category defaults to non-investment, null mode", () => {
      const cat = makeCategory();
      expect(cat.isInvestment).toBe(false);
      expect(cat.investmentLimitMode).toBeNull();
    });

    test("setInvestmentLimitMode flips manual/smart", () => {
      const cat = new Category(
        "cat-inv",
        "tenant-001",
        "Investments",
        null,
        null,
        new Date("2026-01-01"),
        "user-001",
        "green",
        true, // isInvestment
        "smart",
      );
      expect(cat.isInvestment).toBe(true);
      expect(cat.investmentLimitMode).toBe("smart");
      cat.setInvestmentLimitMode("manual");
      expect(cat.investmentLimitMode).toBe("manual");
    });
  });
});
