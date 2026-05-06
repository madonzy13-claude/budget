export type WorkspaceKind = "PRIVATE" | "SHARED";

export interface WorkspaceDTO {
  id: string;
  slug: string; // nanoid(12)
  name: string;
  kind: WorkspaceKind;
  default_currency: string; // ISO-4217 immutable post-create (D-04)
  ownerUserId: string;
  memberCount: number;
  createdAt: Date;
}

export interface MemberDTO {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: Date;
}

export interface MemberShareDTO {
  workspaceId: string;
  userId: string;
  percentage: string; // string for big.js precision (5,2)
  updatedAt: Date;
}
