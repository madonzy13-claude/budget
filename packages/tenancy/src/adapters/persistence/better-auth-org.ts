// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createTenancyModule() from contracts/factory.ts (PC-02, PC-15).
import { organization } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId, type EmailSender } from "@budget/shared-kernel";

export interface OrgDeps {
  emailSender: EmailSender;
  appUrl: string;
}

export function createOrganizationPlugin(deps: OrgDeps) {
  return organization({
    // TENT-09: unlimited orgs per user
    allowUserToCreateOrganization: async () => true,

    // D-12: map to our domain table names
    schema: {
      organization: {
        modelName: "workspaces",
        additionalFields: {
          kind: { type: "string", input: true, required: true }, // D-02 TENT-10
          default_currency: { type: "string", input: true, required: true }, // D-04 TENT-11
          slug: { type: "string", input: true, required: true }, // public-facing nanoid
          // Injected via beforeCreateOrganization hook — `input: false` means callers
          // cannot pass it from the API; the hook overrides it from the session user.
          owner_user_id: { type: "string", input: false, required: true },
        },
      },
      member: { modelName: "workspace_members" },
      invitation: { modelName: "workspace_invitations" },
    },

    organizationHooks: {
      // tenancy.workspaces has columns owner_user_id (NOT NULL) and member_count
      // (NOT NULL DEFAULT 1) that Better Auth's org plugin does not populate. Inject
      // owner_user_id from the creating user; member_count uses its DB default.
      beforeCreateOrganization: async ({ organization, user }) => {
        return {
          data: {
            ...(organization as Record<string, unknown>),
            owner_user_id: user.id,
          },
        };
      },

      // D-02: PRIVATE workspaces refuse invitations at creation time (the row should
      // never exist). The PC-11 BEFORE INSERT trigger on workspace_members is the
      // race-free wall; this hook stops the invitation up front so we don't generate
      // an email for an invitation that can never be accepted.
      beforeCreateInvitation: async ({ organization }) => {
        const org = organization as unknown as { kind?: "PRIVATE" | "SHARED" };
        if (org.kind === "PRIVATE") {
          throw new Error(
            "PRIVATE workspaces accept only the owner. Convert to SHARED first.",
          );
        }
      },

      // D-02: PRIVATE rejects invites (app-layer defense in depth; PC-11 trigger is race-free wall)
      beforeAddMember: async ({ member, organization }) => {
        const org = organization as unknown as {
          id: string;
          kind: "PRIVATE" | "SHARED";
        };
        const actorUserId =
          (member as { user_id?: string; userId?: string }).user_id ??
          (member as { userId?: string }).userId ??
          "";
        // PC-03: use withTenantTx(workspaceId, userId, fn) — never raw pool connects
        const result = await withTenantTx(
          TenantId(org.id),
          UserId(actorUserId),
          async (tx) => {
            const r = await tx.execute(
              sql`SELECT count(*)::int AS c FROM tenancy.workspace_members WHERE workspace_id = ${org.id}`,
            );
            return (r.rows?.[0] as { c: number } | undefined)?.c ?? 0;
          },
        );
        if (result.isErr()) throw result.error;
        if (org.kind === "PRIVATE" && result.value >= 1) {
          throw new Error(
            "PRIVATE workspaces accept only the owner. Convert to SHARED first.",
          );
        }
      },

      // D-04: default_currency immutable

      beforeUpdateOrganization: async (params: any) => {
        // 'data' contains proposed updates — block if it includes default_currency at all
        const data = params.data ?? params;
        if (
          (data as { default_currency?: unknown }).default_currency !==
          undefined
        ) {
          throw new Error(
            "default_currency is immutable post-create (TENT-11, D-04)",
          );
        }
      },

      // D-06: SHARED workspace gains member → insert 0% share row.
      // PC-03: use withTenantTx(workspaceId, userId, fn) — extended signature sets BOTH
      // app.tenant_ids AND app.current_user_id GUCs in same SET LOCAL pair.
      afterAddMember: async ({ member, organization }) => {
        const org = organization as unknown as {
          id: string;
          kind: "PRIVATE" | "SHARED";
        };
        if (org.kind !== "SHARED") return;
        const memberUserId =
          (member as { user_id?: string; userId?: string }).user_id ??
          (member as { userId?: string }).userId ??
          "";
        const r = await withTenantTx(
          TenantId(org.id),
          UserId(memberUserId),
          async (tx) => {
            await tx.execute(sql`
              INSERT INTO tenancy.shared_workspace_member_shares (workspace_id, user_id, percentage)
              VALUES (${org.id}, ${memberUserId}, 0)
              ON CONFLICT DO NOTHING
            `);
          },
        );
        if (r.isErr()) throw r.error;
      },
    },

    sendInvitationEmail: async ({ id, email, organization, inviter }) => {
      const url = `${deps.appUrl}/accept-invitation/${id}`;
      await deps.emailSender.send({
        to: email,
        template: "workspace-invite",
        vars: {
          url,
          workspace: (organization as { name: string }).name,
          inviter: (inviter as { user: { name: string } }).user.name,
        },
      });
    },
  });
}
