/**
 * manifest.ts — the demo scrub allowlist.
 *
 * Every column of every table the demo touches is classified here, exactly
 * once. This file IS the review that the nightly refresh does not repeat: the
 * job copies the owner's live data unattended, and `checkManifest` aborts the
 * run if the schema ever grows something this file has not seen.
 *
 * Rules of engagement when editing:
 *   - There is no default. A new column needs a decision, not a guess.
 *   - When unsure whether a text column is user-authored, choose FAKE_TEXT or
 *     NULL. Never COPY. A wrong FAKE_TEXT costs realism; a wrong COPY publishes
 *     someone's private note.
 *   - jsonb blobs cannot be classified column-by-column. Their table is
 *     `wipe-only`, not `copy`.
 *   - `mode: "wipe-only"` still WIPES. Skipping the wipe would let owner-shaped
 *     rows survive in the demo tenant from night to night.
 */
import type { TableManifest } from "./preflight";

const ts = { kind: "COPY" } as const; // timestamps, enums, booleans, flags
const tenant = { kind: "TENANT" } as const;
const owner = { kind: "OWNER" } as const;
const id = { kind: "REMAP_ID" } as const;
const money0 = { kind: "SCALE_MONEY", decimals: 0 } as const;
const money4 = { kind: "SCALE_MONEY", decimals: 4 } as const;
const ccy = { kind: "RELABEL_CURRENCY" } as const;
const nul = { kind: "NULL" } as const;
const ref = (t: string) => ({ kind: "REMAP_ID", references: t }) as const;
const fake = (
  pool: "merchant" | "category" | "wallet" | "budget" | "holding",
) => ({ kind: "FAKE_TEXT", pool }) as const;

export const demoManifest: TableManifest[] = [
  // ─── tenancy ──────────────────────────────────────────────────────────────
  {
    table: "tenancy.budgets",
    mode: "copy",
    columns: {
      id,
      slug: fake("budget"), // must stay unique — the copy suffixes it
      name: fake("budget"),
      kind: ts,
      default_currency: ccy,
      owner_user_id: owner,
      member_count: ts,
      metadata: nul,
      created_at: ts,
      cushion_mode_enabled: ts,
      timezone: ts,
      reserves_enabled: ts,
      archived_at: ts,
      cushion_enabled: ts,
      cushion_target_months: ts,
      investments_enabled: ts,
      amount_privacy_enabled: ts,
      // DRIFT: `0055_overview_enabled` adds this column and `0056_amount_privacy_flag`
      // RENAMES it to amount_privacy_enabled — so a freshly migrated database
      // does not have it. The dev/prod DB does, because it was re-added by hand
      // afterwards. No application code reads it (grep: only this file), so it
      // is dead weight rather than a broken feature. Optional until someone
      // writes the migration that drops it.
      overview_enabled: { ...nul, optional: true },
    },
  },
  {
    // Membership is SYNTHESISED by the job, not copied: every source member
    // would map to the single demo user (OWNER), colliding on the one-row-per
    // (budget,user) shape. The job wipes these and inserts exactly the demo
    // user on both budgets plus one extra member on the family budget.
    table: "tenancy.budget_members",
    mode: "wipe-only",
    columns: {
      id,
      budget_id: ref("tenancy.budgets"),
      user_id: owner,
      role: ts,
      created_at: ts,
      ownership_share_pct: ts,
      include_in_aggregation: ts,
      // Per-member UI layout state. Nothing sensitive, but the demo has no use
      // for the owner's collapsed-section preferences.
      ui_prefs: nul,
      display_name: fake("budget"),
      amount_privacy_enabled: ts,
    },
  },
  {
    // Per-member ownership splits keyed to REAL user ids. The demo synthesises
    // its own membership, so copying these would dangle.
    table: "tenancy.shared_budget_member_shares",
    mode: "wipe-only",
    columns: {
      budget_id: ref("tenancy.budgets"),
      user_id: owner,
      percentage: ts,
      created_at: ts,
      updated_at: ts,
    },
  },
  {
    // Invitation tokens to REAL budgets — never copied. Not wiped either:
    // app_role has no DELETE here, and it cannot grow, because demoGuard (12-03)
    // blocks the demo user from creating share links at all.
    table: "tenancy.budget_share_links",
    mode: "leave",
    columns: {
      id,
      budget_id: ref("tenancy.budgets"),
      tenant_id: tenant,
      token: nul,
      created_by: owner,
      expires_at: ts,
      revoked_at: ts,
      accepted_by: owner,
      accepted_at: ts,
      created_at: ts,
    },
  },

  // ─── budgeting ────────────────────────────────────────────────────────────
  {
    table: "budgeting.categories",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      name: fake("category"),
      parent_id: ref("budgeting.categories"),
      archived_at: ts,
      created_at: ts,
      actor_user_id: owner,
      sort_index: ts,
      reserve_excluded: ts,
      archived_from: ts,
      color_key: ts,
      is_investment: ts,
      investment_limit_mode: ts,
      cushion_mode: ts,
    },
  },
  {
    table: "budgeting.category_limits",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      category_id: ref("budgeting.categories"),
      normal_amount: money0,
      normal_currency: ccy,
      cushion_amount: money0,
      cushion_currency: ccy,
      effective_from: ts,
      effective_to: ts,
      actor_user_id: owner,
      created_at: ts,
      cushion_amount_cents: money0,
      needs_amount: money0,
      wants_amount: money0,
      no_limit: ts,
    },
  },
  {
    table: "budgeting.category_reserve_adjustments",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      category_id: ref("budgeting.categories"),
      delta_cents: money0,
      note: fake("merchant"),
      created_by: owner,
      occurred_at: ts,
    },
  },
  {
    // Per-user category splits keyed to real user ids; demo membership differs.
    table: "budgeting.category_share_overrides",
    mode: "wipe-only",
    columns: {
      category_id: ref("budgeting.categories"),
      user_id: owner,
      tenant_id: tenant,
      percentage: ts,
      created_at: ts,
      updated_at: ts,
    },
  },
  {
    table: "budgeting.wallets",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      name: fake("wallet"),
      currency: ccy,
      current_balance: money4,
      archived_at: ts,
      created_at: ts,
      actor_user_id: owner,
      wallet_type: ts,
      color: ts,
      icon: ts,
      sort_order: ts,
    },
  },
  {
    table: "budgeting.expense_ledger",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      currency_original: ccy,
      // An FX RATE is a ratio, not an amount — scaling it would corrupt the
      // relationship between amount_original and amount_converted.
      fx_rate: ts,
      fx_as_of: ts,
      created_at: ts,
      transaction_date: ts,
      note: fake("merchant"),
      category_id: ref("budgeting.categories"),
      amount_original_cents: money0,
      amount_converted_cents: money0,
      budget_id: ref("tenancy.budgets"),
      kind: ts,
      scheduled_payment_id: ref("budgeting.scheduled_payments"),
      confirmed_at: ts,
      updated_at: ts,
      deleted_at: ts,
      dismissed_at: ts,
      transfer_group_id: id,
      wallet_id: ref("budgeting.wallets"),
      note_tsv: { kind: "GENERATED" },
    },
  },
  {
    table: "budgeting.incomes",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      name: fake("merchant"),
      amount: money4,
      currency: ccy,
      cadence: ts,
      cadence_anchor: ts,
      weekly_dow: ts,
      yearly_month: ts,
      active: ts,
      created_at: ts,
      updated_at: ts,
      actor_user_id: owner,
      once_date: ts,
    },
  },
  {
    table: "budgeting.scheduled_payments",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      category_id: ref("budgeting.categories"),
      amount: money4,
      currency: ccy,
      cadence: ts,
      cadence_anchor: ts,
      weekly_dow: ts,
      note: fake("merchant"),
      active: ts,
      next_due_date: ts,
      created_at: ts,
      updated_at: ts,
      actor_user_id: owner,
      yearly_month: ts,
      end_date: ts,
      deleted_at: ts,
      // DRIFT: exists on the dev/prod DB but in NO migration and in no
      // application code (grep: only this file). Hand-applied during the
      // needs/wants work and never migrated. Optional until it is either
      // migrated properly or dropped.
      is_need: { ...ts, optional: true },
    },
  },
  {
    table: "budgeting.investments",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      budget_id: ref("tenancy.budgets"),
      // Instruments are global reference data, not tenant data — the demo
      // points at the same rows so live prices still resolve.
      instrument_id: ts,
      name: fake("holding"),
      holding_type: ts,
      group_name: fake("holding"),
      // Prices are market facts and must stay real, or the holding's price
      // history and its live quote would disagree. Scale the QUANTITY instead:
      // that is what makes the position size non-identifying.
      buy_price_cents: ts,
      buy_currency: ccy,
      quantity: money4,
      current_price_cents: ts,
      current_price_currency: ccy,
      sort_order: ts,
      archived_at: ts,
      created_at: ts,
      ui_type: ts,
      metal: ts,
      metal_kind: ts,
      unit_of_measure: ts,
      manual_ticker: ts,
      premium_pct: ts,
      deposit_rate_bps: ts,
      deposit_start_date: ts,
      deposit_end_date: ts,
      deposit_cap_frequency: ts,
      icon: ts,
      color: ts,
    },
  },
  {
    table: "budgeting.reserve_fit_exclusions",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      ledger_id: ref("budgeting.expense_ledger"),
      actor_user_id: owner,
      created_at: ts,
    },
  },
  {
    table: "budgeting.budget_mode_history",
    mode: "copy",
    columns: {
      id,
      budget_id: ref("tenancy.budgets"),
      tenant_id: tenant,
      mode: ts,
      effective_from: ts,
      effective_to: ts,
      actor_user_id: owner,
      created_at: ts,
    },
  },
  {
    table: "budgeting.budget_templates",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      name: fake("category"),
      actor_user_id: owner,
      created_at: ts,
    },
  },
  {
    table: "budgeting.budget_template_items",
    mode: "copy",
    columns: {
      template_id: ref("budgeting.budget_templates"),
      category_id: ref("budgeting.categories"),
      normal_amount: money0,
      normal_currency: ccy,
      cushion_amount: money0,
      cushion_currency: ccy,
      tenant_id: tenant,
    },
  },
  {
    // A value-over-time series that cannot be recomputed from current holdings,
    // so it IS copied, scaled. A line chart has no cross-row sum invariant, so
    // per-row rounding drift is invisible here.
    table: "budgeting.budget_wealth_snapshots",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      budget_id: ref("tenancy.budgets"),
      captured_at: ts,
      capitalization_cents: money0,
      investment_value_cents: money0,
      currency: ccy,
      investment_cost_basis_cents: money0,
    },
  },
  {
    // Derived aggregate. Copying it scaled would drift from the sum of the
    // scaled ledger rows it summarises and surface as a visible inconsistency;
    // the hourly reconciler rebuilds it instead.
    table: "budgeting.spending_by_category_month",
    mode: "wipe-only",
    columns: {
      tenant_id: tenant,
      workspace_id: ref("tenancy.budgets"),
      category_id: ref("budgeting.categories"),
      month_start_date: ts,
      normal_amount: money4,
      cushion_amount: money4,
      currency: ccy,
      updated_at: ts,
    },
  },
  {
    // Tasks are DERIVED from budget state and carry a free-form jsonb payload
    // that column rules cannot scrub. The generators regenerate them for the
    // demo tenant after the copy, which is both safer and more current.
    table: "budgeting.tasks",
    mode: "wipe-only",
    columns: {
      id,
      tenant_id: tenant,
      budget_id: ref("tenancy.budgets"),
      kind: ts,
      payload_json: nul,
      status: ts,
      created_at: ts,
      resolved_at: ts,
    },
  },

  // ─── shared_kernel ────────────────────────────────────────────────────────
  {
    // before/after jsonb snapshots — unclassifiable per column, so never copied.
    // Not wiped either: app_role holds no DELETE here (audit is append-only by
    // design), and no owner row can reach it — every audit row in the demo
    // tenant records a demo action on already-scrubbed data.
    table: "shared_kernel.audit_history",
    mode: "leave",
    columns: {
      id,
      tenant_id: tenant,
      entity_type: ts,
      entity_id: ts,
      action: ts,
      actor_user_id: owner,
      occurred_at: ts,
      before_jsonb: nul,
      after_jsonb: nul,
    },
  },
  {
    // Real browser/device push endpoints. Copying these would point the demo's
    // notifications at the owner's phone.
    table: "shared_kernel.push_subscriptions",
    mode: "wipe-only",
    columns: {
      id,
      tenant_id: tenant,
      user_id: owner,
      endpoint: nul,
      p256dh: nul,
      auth: nul,
      locale: ts,
      created_at: ts,
    },
  },
  {
    table: "shared_kernel.notification_prefs",
    mode: "wipe-only",
    columns: {
      id,
      tenant_id: tenant,
      user_id: owner,
      budget_id: ref("tenancy.budgets"),
      notification_type: ts,
      enabled: ts,
      updated_at: ts,
      config: nul,
    },
  },
  {
    // Transient request-dedup cache holding cached response bodies.
    table: "shared_kernel.idempotency_keys",
    mode: "wipe-only",
    columns: {
      scope_hash: ts,
      body_hash: ts,
      tenant_id: tenant,
      user_id: owner,
      route: ts,
      response_status: ts,
      response_body_jsonb: nul,
      created_at: ts,
      expires_at: ts,
    },
  },
  {
    // Event queue. Copying it would replay the owner's events as the demo's.
    // Not wiped: app_role cannot DELETE here. Demo rows are retired instead by
    // the dispatcher (12-03), which marks them dispatched without sending.
    table: "shared_kernel.outbox",
    mode: "leave",
    columns: {
      id,
      tenant_id: tenant,
      aggregate_type: ts,
      aggregate_id: ts,
      event_type: ts,
      payload_jsonb: nul,
      created_at: ts,
      dispatched_at: ts,
    },
  },
];

/**
 * FK-safe INSERT order. The wipe walks this in REVERSE.
 *
 * Hand-ordered rather than derived: Postgres would happily tell us the FK graph,
 * but the ordering also has to respect the one NO ACTION edge that bit the
 * account-deletion cascade — `category_reserve_adjustments` must be deleted
 * BEFORE `categories`, which reversing this list gives us for free.
 */
export const DEMO_COPY_ORDER = [
  "tenancy.budgets",
  "tenancy.budget_members",
  "budgeting.categories",
  "budgeting.category_limits",
  "budgeting.category_share_overrides",
  "budgeting.category_reserve_adjustments",
  "budgeting.wallets",
  "budgeting.scheduled_payments",
  "budgeting.expense_ledger",
  "budgeting.reserve_fit_exclusions",
  "budgeting.incomes",
  "budgeting.investments",
  "budgeting.budget_mode_history",
  "budgeting.budget_templates",
  "budgeting.budget_template_items",
  "budgeting.budget_wealth_snapshots",
  "budgeting.spending_by_category_month",
  "budgeting.tasks",
  "tenancy.shared_budget_member_shares",
  "tenancy.budget_share_links",
  "shared_kernel.audit_history",
  "shared_kernel.notification_prefs",
  "shared_kernel.push_subscriptions",
  "shared_kernel.idempotency_keys",
  "shared_kernel.outbox",
] as const;

/**
 * How rows of a table are selected for a tenant. Derived from the manifest
 * rather than declared again, so the two cannot disagree:
 *   tenant_id present  → scope by tenant_id
 *   budget_id present  → scope by budget_id
 *   tenancy.budgets    → the budget row itself, by id
 */
export function rowScope(t: TableManifest): {
  column: string;
  kind: "tenant" | "budget" | "self";
} {
  if (t.table === "tenancy.budgets") return { column: "id", kind: "self" };
  if ("tenant_id" in t.columns) return { column: "tenant_id", kind: "tenant" };
  if ("budget_id" in t.columns) return { column: "budget_id", kind: "budget" };
  throw new Error(`demo manifest: cannot scope rows of ${t.table}`);
}
