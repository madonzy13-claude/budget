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

    // D-12: map to our domain table names (v1.1: budgets / budget_members / budget_invitations)
    schema: {
      organization: {
        modelName: "budgets",
        additionalFields: {
          // kind-removal: no longer written on create (column is now nullable).
          // Kept in the schema (input:false, not required) so Better Auth still
          // maps the column for reads of legacy rows; new budgets insert NULL.
          kind: { type: "string", input: false, required: false }, // D-02 TENT-10 (retired)
          default_currency: { type: "string", input: true, required: true }, // D-04 TENT-11
          slug: { type: "string", input: true, required: true }, // public-facing nanoid
          // Injected via beforeCreateOrganization hook — `input: false` means callers
          // cannot pass it from the API; the hook overrides it from the session user.
          owner_user_id: { type: "string", input: false, required: true },
        },
      },
      member: { modelName: "budget_members" },
      invitation: { modelName: "budget_invitations" },
    },

    organizationHooks: {
      // tenancy.budgets has columns owner_user_id (NOT NULL) and member_count
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

      // kind-removal: the beforeCreateInvitation + beforeAddMember PRIVATE-cap
      // hooks are GONE. Any budget can be invited to / add members; the DB
      // private-cap trigger was dropped in the same change.

      // Phase 14 (D-01): no currency lock — a budget's currency can change at
      // any time; totals are re-expressed at read time.

      // Budget gains member → insert 0% legacy contribution-split row
      // (kind-removal: every budget, not just SHARED — a budget becomes
      // "shared" simply by having >1 member). This is the separate, untouched
      // legacy shared_budget_member_shares system (packages/tenancy/src/domain/share.ts).
      // ownership_share_pct (the new self-set all-budgets-aggregate share)
      // needs no hook here — its column DEFAULT (100) handles every member,
      // owner and invitee alike.
      // PC-03: use withTenantTx(budgetId, userId, fn) — extended signature sets BOTH
      // app.tenant_ids AND app.current_user_id GUCs in same SET LOCAL pair.
      afterAddMember: async ({ member, organization }) => {
        const org = organization as unknown as {
          id: string;
        };
        const memberUserId =
          (member as { user_id?: string; userId?: string }).user_id ??
          (member as { userId?: string }).userId ??
          "";
        const r = await withTenantTx(
          TenantId(org.id),
          UserId(memberUserId),
          async (tx) => {
            await tx.execute(sql`
              INSERT INTO tenancy.shared_budget_member_shares (budget_id, user_id, percentage)
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
