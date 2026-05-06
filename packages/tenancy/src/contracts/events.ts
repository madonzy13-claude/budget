export interface WorkspaceCreated {
  workspaceId: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  ownerUserId: string;
}

export interface MemberAdded {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
}

export interface MemberLeft {
  workspaceId: string;
  userId: string;
}

export interface OwnershipTransferred {
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
}

export interface SharesUpdated {
  workspaceId: string;
  actorUserId: string;
  shares: Array<{ userId: string; percentage: string }>;
}
