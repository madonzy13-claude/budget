/**
 * Ownership-share default: every member (owner or invited) now defaults to
 * ownership_share_pct = 100 (column DEFAULT, no Σ=100 cross-member
 * constraint — see packages/tenancy/src/domain/share.ts / update-shares.ts
 * for the separate, untouched legacy contribution-split system).
 * Integration test — testcontainer PG.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";
import { createTestBudgetWithOwner, addMemberViaAccept } from "./helpers";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

describe("ownership-share default (self-set, no Σ=100 constraint)", () => {
  it("a newly created budget's owner has 100%", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const shares = await new DrizzleBudgetRepo().listMemberShares(budgetId);
    expect(shares).toEqual([{ userId: ownerUserId, pct: 100 }]);
  });

  it("a new member (accepted invite) also defaults to 100% — no Σ=100 fold-in", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const memberUserId = await addMemberViaAccept(budgetId);
    const shares = await new DrizzleBudgetRepo().listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerUserId, pct: 100 });
    expect(shares).toContainEqual({ userId: memberUserId, pct: 100 });
  });
});
