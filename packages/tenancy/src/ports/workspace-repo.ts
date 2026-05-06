import type { WorkspaceDTO, MemberDTO } from "../contracts/api";

export interface WorkspaceRepo {
  findById(id: string): Promise<WorkspaceDTO | null>;
  listForUser(userId: string): Promise<WorkspaceDTO[]>;
  listMembers(workspaceId: string): Promise<MemberDTO[]>;
}
