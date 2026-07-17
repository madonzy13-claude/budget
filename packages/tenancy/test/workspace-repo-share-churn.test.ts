/**
 * Task 5: ownership-share churn — budget create sets owner 100%, invite-accept
 * joins at 0% (column DEFAULT, no code change), and member-removal folds the
 * removed member's share into the owner. Integration test — testcontainer PG.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";
import {
  createTestBudgetWithOwner,
  addMemberViaAccept,
  removeMember,
} from "./helpers";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

describe("ownership-share churn", () => {
  it("a newly created budget's owner has 100%", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const shares = await new DrizzleBudgetRepo().listMemberShares(budgetId);
    expect(shares).toEqual([{ userId: ownerUserId, pct: 100 }]);
  });

  it("an accepted invite joins at 0%; the owner stays 100%", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const memberUserId = await addMemberViaAccept(budgetId);
    const shares = await new DrizzleBudgetRepo().listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerUserId, pct: 100 });
    expect(shares).toContainEqual({ userId: memberUserId, pct: 0 });
  });

  it("removing a member folds their share into the owner", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const memberUserId = await addMemberViaAccept(budgetId);
    const repo = new DrizzleBudgetRepo();
    await repo.setMemberShares(budgetId, [
      { userId: ownerUserId, pct: 70 },
      { userId: memberUserId, pct: 30 },
    ]);
    await removeMember(budgetId, memberUserId);
    const shares = await repo.listMemberShares(budgetId);
    expect(shares).toEqual([{ userId: ownerUserId, pct: 100 }]);
  });
});
