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
import type { Basis, TableManifest } from "./preflight";

const ts = { kind: "COPY" } as const; // timestamps, enums, booleans, flags
const tenant = { kind: "TENANT" } as const;
const owner = { kind: "OWNER" } as const;
const id = { kind: "REMAP_ID" } as const;

/**
 * Money (261113, user): converted at the rate from its own currency into the
 * one it is relabelled to, then scaled — WEALTH (wallets, investments) by the
 * pair's ×0.1–5, everything else (FLOW) by its ×0.8–1.2. `c` is SQL for the
 * source currency; `$HOME` is the source budget's own.
 */
const money = (
  c: string | undefined,
  basis: Basis,
  decimals: 0 | 4 | 6 | 8 = 0,
) => ({ kind: "SCALE_MONEY", decimals, basis, ccy: c }) as const;
const flow0 = (c: string) => money(c, "flow");
const wealth0 = (c: string) => money(c, "wealth");
// Targets, not sums — safe to round to what a person would have typed.
const limit0 = (c: string) => ({ ...money(c, "flow"), round: "nice" }) as const;
const limit4 = (c: string) =>
  ({ ...money(c, "flow", 4), round: "nice" }) as const;
const HOME = "$HOME";
// An investment entry's amounts are in its holding's currency.
const HOLDING_CCY = `(SELECT coalesce(i.current_price_currency, i.buy_currency)::text FROM budgeting.investments i WHERE i.id = src.holding_id)`;
// A one-unit asset (broker, cash, bond…) keeps its VALUE in the price.
const AMOUNT_HOLDING = `(SELECT i.ui_type NOT IN ('stocks','crypto','precious_metals','collectibles') AND i.quantity = 1 FROM budgeting.investments i WHERE i.id = src.holding_id)`;
const ccy = { kind: "RELABEL_CURRENCY" } as const;
const nul = { kind: "NULL" } as const;
const ref = (t: string) => ({ kind: "REMAP_ID", references: t }) as const;
const fake = (
  pool:
    | "merchant"
    | "category"
    | "income"
    | "scheduled"
    | "wallet"
    | "budget"
    | "holding",
) => ({ kind: "FAKE_TEXT", pool }) as const;
/** A merchant drawn from the row's own category, so the note makes sense. */
const merchantOfCategory = {
  kind: "FAKE_TEXT",
  pool: "merchant",
  coherentWithCategory: true,
  fillNull: true,
} as const;
/** A name worked out per row before the copy — see copy.ts buildNameMap. */
const mapped = (field: string) => ({ kind: "MAPPED_TEXT", field }) as const;

export const demoManifest: TableManifest[] = [
  // ─── tenancy ──────────────────────────────────────────────────────────────
  {
    table: "tenancy.budgets",
    mode: "copy",
    columns: {
      id,
      // UNIQUE across ALL budgets, not just the demo ones.
      slug: { ...fake("budget"), unique: true as const },
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
      // Phase 13 (0087): fixed type keys, no PII.
      investment_type_order: ts,
      // Forced false by the copy — see copyIntoDemoTenant. The rule stays COPY
      // so the preflight still accounts for the column.
      amount_privacy_enabled: ts,
      // DRIFT: `0055_overview_enabled` adds this column and `0056_amount_privacy_flag`
      // RENAMES it to amount_privacy_enabled — so a freshly migrated database
      // does not have it. The dev/prod DB does, because it was re-added by hand
      // afterwards. No application code reads it (grep: only this file), so it
      // is dead weight rather than a broken feature. Optional until someone
      // writes the migration that drops it.
      overview_enabled: { ...nul, optional: true },
      // 0103: better-auth 1.7's organization.logo. Never read by the app; an
      // image URL would be owner-supplied, so it does not travel.
      logo: nul,
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
      // UNIQUE (tenant_id, lower(name)) WHERE archived_at IS NULL.
      // By what the source category IS (House → Housing), unique per tenant.
      name: mapped("name"),
      parent_id: ref("budgeting.categories"),
      archived_at: ts,
      created_at: ts,
      actor_user_id: owner,
      sort_index: ts,
      reserve_excluded: ts,
      archived_from: ts,
      color_key: ts,
      cushion_mode: ts,
      // Phase 14 (mig 0104): the category's own currency.
      currency: ccy,
    },
  },
  {
    table: "budgeting.category_limits",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      category_id: ref("budgeting.categories"),
      normal_amount: limit0("src.normal_currency"),
      normal_currency: ccy,
      cushion_amount: limit0("src.cushion_currency"),
      cushion_currency: ccy,
      effective_from: ts,
      effective_to: ts,
      actor_user_id: owner,
      created_at: ts,
      cushion_amount_cents: limit0("src.cushion_currency"),
      needs_amount: limit0("src.normal_currency"),
      // Rounded too, then re-derived as total − needs (copy.ts fixups) so the
      // two parts still add up to the limit.
      wants_amount: limit0("src.normal_currency"),
      no_limit: ts,
      // 0105: real typed amounts + currency — dropped; a demo limit converts from itself.
      converted_from: nul,
    },
  },
  {
    table: "budgeting.category_reserve_adjustments",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      category_id: ref("budgeting.categories"),
      delta_cents: flow0("src.currency"),
      // Phase 14 (mig 0104): the adjustment's currency (its category's).
      currency: ccy,
      // A reserve MOVE, never a shop item: "Top-up" / "Covered overspend".
      note: {
        kind: "SIGNED_TEXT",
        column: "delta_cents",
        pos: "reserveIn",
        neg: "reserveOut",
      },
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
      // By wallet type, never repeated (a cushion is not a "Credit Card").
      name: mapped("name"),
      currency: ccy,
      // Wealth — except a RESERVE wallet, which holds the reserves the flows
      // build, so it moves with them.
      current_balance: {
        ...money("src.currency", "wealth", 4),
        alt: { when: "src.wallet_type = 'RESERVE'", basis: "flow" },
      },
      // 0101: trigger-stamped "updated … ago"; a timestamp, no PII.
      balance_updated_at: ts,
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
      // Re-derived from the converted amounts, so original × rate = converted.
      fx_rate: { kind: "RATE", from: "src.currency_original", to: HOME },
      fx_as_of: ts,
      created_at: ts,
      transaction_date: ts,
      note: merchantOfCategory,
      category_id: ref("budgeting.categories"),
      amount_original_cents: flow0("src.currency_original"),
      amount_converted_cents: flow0(HOME),
      budget_id: ref("tenancy.budgets"),
      kind: ts,
      scheduled_payment_id: ref("budgeting.scheduled_payments"),
      confirmed_at: ts,
      updated_at: ts,
      deleted_at: ts,
      dismissed_at: ts,
      // 0099: a postponed unconfirmed scheduled payment.
      deferred_at: ts,
      transfer_group_id: id,
      wallet_id: ref("budgeting.wallets"),
      note_tsv: { kind: "GENERATED" },
      // 0110: the amount stored in the budget's currency. Derived — the BEFORE
      // trigger fills it from the copied row itself.
      fx_cache_ccy: nul,
      fx_cache_cents: nul,
    },
  },
  {
    table: "budgeting.incomes",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      // By cadence and size: the biggest monthly income is the salary.
      name: mapped("name"),
      amount: limit4("src.currency"),
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
      // Not rounded: it must equal the payments it already generated.
      amount: money("src.currency", "flow", 4),
      currency: ccy,
      cadence: ts,
      cadence_anchor: ts,
      weekly_dow: ts,
      // From its category's vocabulary — never "Mortgage payment" in Beauty.
      note: merchantOfCategory,
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
      // 0088: UNIQUE (budget_id, ui_type, lower(btrim(name))) — the label is the asset key.
      // By type: "BTC – Exchange", "Krugerrand 1 oz", "Brokerage Account".
      name: mapped("name"),
      holding_type: ts,
      group_name: mapped("group_name"),
      // Prices are market facts and must stay real, or the holding's price
      // history and its live quote would disagree — converted, never scaled.
      // Scale the QUANTITY instead: that is what makes the position size
      // non-identifying. 8 decimals: crypto lives there. (A one-unit asset's
      // value moves back into its price after the copy — copy.ts fixups.)
      buy_price_cents: money("src.buy_currency", "none"),
      buy_currency: ccy,
      quantity: money(undefined, "wealth", 8),
      current_price_cents: money("src.current_price_currency", "none", 6),
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
      // 0101: trigger-stamped "updated … ago"; a timestamp, no PII.
      value_updated_at: ts,
    },
  },
  {
    // Phase 13 (0087). Cost/flow/realized amounts take the WEALTH factor like
    // the holding's quantity (prices are only converted) so Σhistory still
    // matches the holding; qty_delta scales exactly like investments.quantity.
    table: "budgeting.investment_history",
    mode: "copy",
    columns: {
      id,
      tenant_id: tenant,
      budget_id: ref("tenancy.budgets"),
      holding_id: ref("budgeting.investments"),
      kind: ts,
      effective_date: ts,
      amount_cents: wealth0("src.amount_currency"),
      amount_currency: ccy,
      qty_delta: money(undefined, "wealth", 8),
      cost_delta_cents: wealth0("src.cost_currency"),
      cost_currency: ccy,
      flow_cents: wealth0("src.flow_currency"),
      flow_currency: ccy,
      sold_cost_budget_cents: wealth0(
        `coalesce(src.budget_currency, '${HOME}')`,
      ),
      realized_budget_cents: wealth0(
        `coalesce(src.budget_currency, '${HOME}')`,
      ),
      budget_currency: ccy,
      value_delta_cents: wealth0(HOLDING_CCY),
      prior_principal_cents: wealth0(
        `coalesce(src.amount_currency, ${HOLDING_CCY})`,
      ),
      prior_start_date: ts,
      // Shared by both legs of a conversion. The global id map sends one
      // source uuid to one destination uuid, so the legs stay paired.
      transfer_id: id,
      created_at: ts,
      deleted_at: ts,
      // 0088 (Phase 13.1): sell → wallet credit scales like wallets.current_balance.
      wallet_id: ref("budgeting.wallets"),
      wallet_delta_numeric: money(
        `(SELECT w.currency::text FROM budgeting.wallets w WHERE w.id = src.wallet_id)`,
        "wealth",
        4,
      ),
      wallet_created: ts,
      // A unit price (converted only) — or, on a one-unit asset, its previous
      // VALUE, which scales like the value.
      prior_price_cents: {
        ...money("src.prior_price_currency", "none", 6),
        alt: { when: AMOUNT_HOLDING, basis: "wealth" },
      },
      prior_price_currency: ccy,
      backfilled: ts,
      // 0094: the deal's amount in the asset's own currency — scales like amount_cents.
      asset_amount_cents: wealth0(HOLDING_CCY),
      // 0098: the user's own note on a sale. Free text, so it does not travel.
      note: nul,
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
      normal_amount: limit0("src.normal_currency"),
      normal_currency: ccy,
      cushion_amount: limit0("src.cushion_currency"),
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
      capitalization_cents: wealth0("src.currency"),
      investment_value_cents: wealth0("src.currency"),
      currency: ccy,
      investment_cost_basis_cents: wealth0("src.currency"),
      source: ts, // 'worker' | 'import' (15-21)
      // 0110: derived by the BEFORE trigger, like the ledger's.
      fx_cache_ccy: nul,
      fx_cache_capitalization_cents: nul,
      fx_cache_investment_value_cents: nul,
      fx_cache_investment_cost_basis_cents: nul,
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
      normal_amount: money("src.currency", "flow", 4),
      cushion_amount: money("src.currency", "flow", 4),
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
  {
    // MCP undo journal (Phase 15): before/after jsonb of an assistant's writes.
    // Never copied. RLS scopes it by user, and the wipe runs as the demo user,
    // so it clears only what an assistant did in the demo itself.
    table: "shared_kernel.mcp_write_log",
    mode: "wipe-only",
    columns: {
      id,
      tenant_id: tenant,
      user_id: owner,
      client_id: nul,
      call_id: ts,
      batch_id: ts,
      tool: ts,
      entity_type: ts,
      entity_id: ts,
      op: ts,
      before_jsonb: nul,
      after_jsonb: nul,
      entry_count: ts,
      created_at: ts,
      reverted_at: ts,
      reverted_by_call_id: ts,
    },
  },
  {
    // Short-lived import previews holding the rows an assistant sent. Same
    // per-user scoping as the write log.
    table: "shared_kernel.mcp_import_previews",
    mode: "wipe-only",
    columns: {
      id,
      tenant_id: tenant,
      user_id: owner,
      client_id: nul,
      kind: ts,
      payload_hash: ts,
      rows_jsonb: nul,
      issues_jsonb: nul,
      created_at: ts,
      expires_at: ts,
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
  "budgeting.investment_history",
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
  "shared_kernel.mcp_write_log",
  "shared_kernel.mcp_import_previews",
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
