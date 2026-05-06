// Stub — implemented fully in Task 3.
import type {
  WorkspaceDTO,
  MemberDTO,
  MemberShareDTO,
} from "../../contracts/api";
import type { WorkspaceRepo } from "../../ports/workspace-repo";
import type { MemberShareRepo } from "../../ports/member-repo";

export class DrizzleWorkspaceRepo implements WorkspaceRepo {
  async findById(_id: string): Promise<WorkspaceDTO | null> {
    throw new Error("not implemented");
  }
  async listForUser(_userId: string): Promise<WorkspaceDTO[]> {
    throw new Error("not implemented");
  }
  async listMembers(_workspaceId: string): Promise<MemberDTO[]> {
    throw new Error("not implemented");
  }
}

export class DrizzleMemberShareRepo implements MemberShareRepo {
  async list(_workspaceId: string): Promise<MemberShareDTO[]> {
    throw new Error("not implemented");
  }
  async update(
    _workspaceId: string,
    _shares: { userId: string; percentage: string }[],
    _actorUserId: string,
  ): Promise<void> {
    throw new Error("not implemented");
  }
}
