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

  // Important finding: the fold used `WHERE role = 'owner'`, which credits
  // EVERY owner on a multi-owner budget. With owner A + promoted owner B,
  // a departing member's share must land ONLY on the single canonical owner
  // (tenancy.budgets.owner_user_id — here, the creator A), not on B too,
  // or Σ ends up > 100.
  it("multi-owner: a departing member's share folds onto the single canonical owner only, not every owner", async () => {
    const { budgetId, ownerUserId: ownerA } = await createTestBudgetWithOwner();
    const ownerB = await addMemberViaAccept(budgetId);
    const memberC = await addMemberViaAccept(budgetId);
    const repo = new DrizzleBudgetRepo();

    // Promote B to owner (multi-owner budget) via the same path the
    // promote-to-owner route uses.
    await repo.setMemberRole(budgetId, ownerB, "owner", ownerA);

    await repo.setMemberShares(budgetId, [
      { userId: ownerA, pct: 40 },
      { userId: ownerB, pct: 30 },
      { userId: memberC, pct: 30 },
    ]);

    await removeMember(budgetId, memberC); // C leaves

    const shares = await repo.listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerA, pct: 70 }); // 40 + C's 30
    expect(shares).toContainEqual({ userId: ownerB, pct: 30 }); // unchanged
    expect(shares.find((s) => s.userId === memberC)).toBeUndefined();
    expect(shares.reduce((sum, s) => sum + s.pct, 0)).toBe(100);
  });

  // Critical finding: POST /:id/members/:memberId/revoke (owner-initiated
  // removal) called auth.api.removeMember directly and never folded, so Σ
  // share permanently dropped below 100 after an owner kicked a member.
  // The route now calls foldShareIntoOwner before removeMember (verified by
  // reading apps/api/src/routes/budget-members.ts and by a route-level test
  // in apps/api/test/routes/budget-members.test.ts that asserts call order:
  // fold, then removeMember). This test exercises foldShareIntoOwner itself
  // — the tenancy package has no HTTP/Better-Auth route harness to drive the
  // real revoke endpoint end-to-end.
  it("foldShareIntoOwner (owner-revoke path): adds the departing member's share to the canonical owner without deleting the row", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const memberUserId = await addMemberViaAccept(budgetId);
    const repo = new DrizzleBudgetRepo();
    await repo.setMemberShares(budgetId, [
      { userId: ownerUserId, pct: 60 },
      { userId: memberUserId, pct: 40 },
    ]);

    await repo.foldShareIntoOwner(budgetId, memberUserId);

    const shares = await repo.listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerUserId, pct: 100 });
    // fold does not delete — the route removes the row afterward via
    // auth.api.removeMember, once the share has already been read/folded.
    expect(shares).toContainEqual({ userId: memberUserId, pct: 40 });
  });
});
