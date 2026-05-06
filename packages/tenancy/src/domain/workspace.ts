import { ok, err, type Result } from "@budget/shared-kernel";
import type { WorkspaceKind } from "../contracts/api";

export class Workspace {
  constructor(
    public readonly id: string,
    public readonly slug: string,
    public name: string,
    public readonly kind: WorkspaceKind,
    public readonly default_currency: string, // readonly enforces D-04
    public readonly ownerUserId: string,
    public memberCount: number,
    public readonly createdAt: Date,
  ) {}

  canAcceptMember(): Result<void, Error> {
    if (this.kind === "PRIVATE" && this.memberCount >= 1) {
      return err(
        new Error(
          "PRIVATE workspaces accept only the owner. Convert to SHARED first.",
        ),
      );
    }
    return ok(undefined);
  }

  canBeLeftBy(userId: string, allOwnerIds: string[]): Result<void, Error> {
    const isOwner = userId === this.ownerUserId || allOwnerIds.includes(userId);
    if (isOwner && allOwnerIds.length === 1) {
      return err(
        new Error(
          "Cannot leave as last owner — transfer ownership first (TENT-05)",
        ),
      );
    }
    return ok(undefined);
  }
}
