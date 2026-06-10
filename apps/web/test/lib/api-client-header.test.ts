/**
 * api-client-header.test.ts — Vitest unit tests for budget-fetch path extraction.
 *
 * Tests:
 * - extractBudgetIdFromPath extracts ID from /[locale]/budgets/[id]/... paths
 * - returns null for /[locale]/workspaces/... paths (old pattern)
 * - returns null for non-matching paths
 */
import { describe, test, expect } from "vitest";

// Dynamic import so the test works before AND after the rename.
// We try budget-fetch first; fall back to workspace-fetch so RED is clean.
let extractFn: ((p: string) => string | null) | null = null;

async function getExtractFn(): Promise<(p: string) => string | null> {
  if (extractFn) return extractFn;
  try {
    const mod = await import("@/lib/budget-fetch");
    extractFn = (
      mod as unknown as {
        extractBudgetIdFromPath: (p: string) => string | null;
      }
    ).extractBudgetIdFromPath;
    return extractFn!;
  } catch {
    // Fall back to old file during RED phase
    const mod = await import("@/lib/workspace-fetch");
    extractFn = (
      mod as unknown as {
        extractWorkspaceIdFromPath: (p: string) => string | null;
      }
    ).extractWorkspaceIdFromPath;
    return extractFn!;
  }
}

describe("budget-fetch path extraction", () => {
  test("extractBudgetIdFromPath — module exports the renamed function", async () => {
    // This test is the RED gate: budget-fetch.ts with extractBudgetIdFromPath must exist
    const mod = await import("@/lib/budget-fetch").catch(() => null);
    expect(
      mod,
      "budget-fetch module must exist (rename workspace-fetch → budget-fetch)",
    ).not.toBeNull();
    expect(
      (mod as unknown as Record<string, unknown>).extractBudgetIdFromPath,
      "extractBudgetIdFromPath must be exported from budget-fetch",
    ).toBeDefined();
  });

  test("extracts budget ID from /en/budgets/[uuid]/... path", async () => {
    const extract = await getExtractFn();
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = extract(`/en/budgets/${uuid}/transactions`);
    expect(result).toBe(uuid);
  });

  test("extracts budget ID from /pl/budgets/[uuid] path (no trailing segment)", async () => {
    const extract = await getExtractFn();
    const uuid = "f0e1d2c3-b4a5-6789-0abc-def012345678";
    const result = extract(`/pl/budgets/${uuid}`);
    expect(result).toBe(uuid);
  });

  test("returns null for old /workspaces/ pattern", async () => {
    // After rename, /workspaces/ paths must NOT extract an ID
    const mod = await import("@/lib/budget-fetch").catch(() => null);
    if (!mod) return; // RED phase - skip if file doesn't exist yet
    const extract = (
      mod as unknown as {
        extractBudgetIdFromPath: (p: string) => string | null;
      }
    ).extractBudgetIdFromPath;
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(extract(`/en/workspaces/${uuid}/budget`)).toBeNull();
  });

  test("returns null for non-matching paths", async () => {
    const extract = await getExtractFn();
    expect(extract("/en/sign-in")).toBeNull();
    expect(extract("/en/settings")).toBeNull();
    expect(extract("/")).toBeNull();
  });
});
