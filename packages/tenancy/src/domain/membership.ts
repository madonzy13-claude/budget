export type Role = "owner" | "member";

export class Membership {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public role: Role,
    public readonly joinedAt: Date,
  ) {}

  canInvite(): boolean {
    return this.role === "owner";
  }
}
