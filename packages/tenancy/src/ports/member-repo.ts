import type { MemberShareDTO } from "../contracts/api";

export interface MemberShareRepo {
  list(workspaceId: string): Promise<MemberShareDTO[]>;
  update(
    workspaceId: string,
    shares: { userId: string; percentage: string }[],
    actorUserId: string,
  ): Promise<void>;
}
