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

/**
 * D-04/TENT-11 currency lock — TRANSACTION-AWARE (quick-260613-nkb).
 *
 * Mirrors workspaceRepo.hasTransactions exactly: a budget's default_currency is
 * editable until the first non-deleted budgeting.expense_ledger row, then locked.
 * Throws if locked; resolves silently if allowed. Exported so it is unit-testable
 * without driving Better Auth's HTTP/session machinery.
 *
 * @throws Error when the budget already has a non-deleted transaction.
 */
export async function assertCurrencyChangeAllowed(input: {
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  const { orgId, actorUserId } = input;
  if (!orgId) {
    // Cannot determine which budget — stay conservative (do NOT silently allow).
    throw new Error(
      "default_currency change rejected: budget id could not be resolved (TENT-11, D-04)",
    );
  }
  const safeId = orgId.replace(/[^a-fA-F0-9-]/g, "");
  const r = await withTenantTx(
    TenantId(orgId),
    UserId(actorUserId || orgId),
    async (tx) => {
      // Mirror hasTransactions: set app.tenant_ids so RLS exposes the ledger row.
      await tx.execute(sql.raw(`SET LOCAL app.tenant_ids = '{${safeId}}'`));
      const res = await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS(
          SELECT 1 FROM budgeting.expense_ledger
          WHERE budget_id = ${orgId}::uuid AND deleted_at IS NULL
        ) AS exists
      `);
      return res.rows[0]?.exists ?? false;
    },
  );
  if (r.isErr()) throw r.error;
  if (r.value) {
    throw new Error(
      "default_currency is locked after the first transaction (TENT-11, D-04)",
    );
  }
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

      // D-04/TENT-11: default_currency locked only AFTER the first transaction (matches app guard).
      // quick-260613-nkb: the PATCH /budgets/:id route bypasses Better Auth (it calls
      // workspaceRepo.updateIdentity directly), so this hook is DORMANT for the active
      // bug — but we relax it to the SAME transaction-aware rule so every write path is
      // consistent and the latent unconditional-throw trap is removed. The invariant is
      // preserved: a budget WITH a non-deleted transaction still cannot change currency.
      beforeUpdateOrganization: async (params: any) => {
        // Better Auth passes { organization: ctx.body.data, user, member } to this
        // hook (see better-auth/.../routes/crud-org.mjs). `organization` here is the
        // PROPOSED update payload (not the persisted org). Tolerate the older flat
        // shape (`params.data`) for safety.
        const data = params.organization ?? params.data ?? params;
        if (
          (data as { default_currency?: unknown }).default_currency ===
          undefined
        ) {
          return; // nothing to check — same as before
        }

        // Resolve the budget (org) id. Better Auth gives us `member.organizationId`
        // (the org being updated); fall back to other shapes for robustness.
        const orgId =
          (params as { member?: { organizationId?: string } }).member
            ?.organizationId ??
          (params as { organizationId?: string }).organizationId ??
          (data as { organizationId?: string; id?: string }).organizationId ??
          (data as { id?: string }).id ??
          "";
        // actor for the tx: prefer the session user; else the membership user id.
        const actorUserId =
          (params as { user?: { id?: string } }).user?.id ??
          (params as { member?: { userId?: string } }).member?.userId ??
          (params as { userId?: string }).userId ??
          "";
        // Shared transaction-aware rule (also exercised directly in tests).
        await assertCurrencyChangeAllowed({ orgId, actorUserId });
      },

      // Budget gains member → insert 0% share row (kind-removal: every budget,
      // not just SHARED — a budget becomes "shared" simply by having >1 member).
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
        // Task 5: this hook fires on org creation too (Better Auth's
        // createOrganization internally calls addMember for the creator with
        // role "owner"), which is the only point where the owner's
        // tenancy.budget_members row exists to patch. The column DEFAULT (0)
        // is correct for every other add (invited members) — only the owner
        // needs the bump to 100%.
        const memberRole = (member as { role?: string }).role;
        const r = await withTenantTx(
          TenantId(org.id),
          UserId(memberUserId),
          async (tx) => {
            await tx.execute(sql`
              INSERT INTO tenancy.shared_budget_member_shares (budget_id, user_id, percentage)
              VALUES (${org.id}, ${memberUserId}, 0)
              ON CONFLICT DO NOTHING
            `);
            if (memberRole === "owner") {
              await tx.execute(sql`
                UPDATE tenancy.budget_members
                   SET ownership_share_pct = 100
                 WHERE budget_id = ${org.id}::uuid AND user_id = ${memberUserId}::uuid
              `);
            }
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
