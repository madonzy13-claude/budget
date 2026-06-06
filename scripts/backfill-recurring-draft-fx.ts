#!/usr/bin/env bun
/**
 * backfill-recurring-draft-fx.ts — STEP 2 re-conversion backfill (05-21).
 *
 * Re-derives every UNCONFIRMED recurring draft from its RULE (the source of
 * truth) and re-converts the foreign-currency amount through the REAL
 * FrankfurterFxProvider — fixing the rate-1 drafts the InMemoryFxProvider stub
 * leaked into generation, AND repairing migration 0031's corruption (0031
 * relabeled currency_original PLN->EUR on the UNCONVERTED rate-1 amounts, so the
 * draft's currency_original is NOT trustworthy — only the rule is).
 *
 * Why a script and not SQL: SQL cannot call FX. 0031 proved a SQL "fix" only
 * relabels; real conversion needs FrankfurterFxProvider.rateAsOf.
 *
 * RLS structure (mirrors the worker recurring engine; NO FORCE-RLS toggle):
 *   - withInfraTx (worker_role, recurring_rules_worker_cron_scan USING true)
 *     enumerates distinct tenant_ids that own recurring rules.
 *   - PER TENANT withTenantTx (app_role + app.tenant_ids/app.current_user_id GUC)
 *     selects that tenant's unconfirmed recurring drafts joined to rule+budget,
 *     re-converts, and UPDATEs. app_role holds column-level UPDATE on
 *     expense_ledger; the tenant-isolation policy scopes every row. The
 *     append-only ledger denies app_role DELETE — we only UPDATE in place.
 *
 * Per draft (recurring_rule_id NOT NULL, confirmed_at NULL, deleted_at NULL):
 *   - rule.currency == budget.default_currency  -> ensure budget-locked
 *       (orig = conv = round(rule.amount*100), currency = budget, fx_rate = 1);
 *       already correct -> SKIP (no write).
 *   - else -> rate = fxProvider.rateAsOf(rule.currency, budget, transaction_date);
 *       converted = round(rule.amount*100 * Number(rate));
 *       UPDATE amount_original_cents = amount_converted_cents = converted,
 *              currency_original = budget, fx_rate = 1, updated_at = now()
 *       (budget-locked — same convention as the worker fix).
 *   - NoFxRateAvailable -> SKIP that draft, collect + report (cannot guess).
 *
 * Usage:
 *   bun run scripts/backfill-recurring-draft-fx.ts            # DRY-RUN (default)
 *   bun run scripts/backfill-recurring-draft-fx.ts --apply    # APPLY updates
 *
 * One-shot data fix — run-and-delete (like replay-budgeting / prior diag).
 * Required env: DATABASE_URL_APP, DATABASE_URL_WORKER (Infisical).
 */
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const ORENDA_MATCH = "ренда"; // substring of the confirmed "Оренда" rule note

interface DraftRow {
  id: string;
  tenant_id: string;
  transaction_date: string;
  currency_original: string;
  amount_original_cents: string;
  amount_converted_cents: string;
  fx_rate: string;
  rule_amount: string; // numeric(19,4) major units
  rule_currency: string;
  rule_note: string | null;
  budget_currency: string;
}

interface PlanItem {
  draftId: string;
  tenantId: string;
  ruleNote: string;
  ruleAmount: string;
  ruleCurrency: string;
  budget: string;
  storedCcy: string;
  storedConvCents: string;
  newConvCents: string;
  rate: string;
  action: "convert" | "lock-same-ccy" | "skip-already-correct" | "skip-no-rate";
}

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

async function main(): Promise<void> {
  const APP_RAW = process.env.DATABASE_URL_APP;
  if (!APP_RAW) throw new Error("DATABASE_URL_APP required");
  process.env.DATABASE_URL_APP = APP_RAW.replace("@db:", "@localhost:");
  if (process.env.DATABASE_URL_WORKER) {
    process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
      "@db:",
      "@localhost:",
    );
  }

  const { withInfraTx, withTenantTx, resetPools, workerPool } =
    await import("@budget/platform");
  const { TenantId, UserId } = await import("@budget/shared-kernel");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { FrankfurterFxProvider, NoFxRateAvailable } =
    await import("@budget/budgeting/src/adapters/fx/frankfurter");
  resetPools();

  const fxProvider = new FrankfurterFxProvider(
    new DrizzleFxRateCacheRepo(workerPool()),
  );

  console.log(
    `\n=== backfill-recurring-draft-fx (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`,
  );

  // --- Scan distinct tenants via worker_role cron_scan policy ----------------
  const tenantsRes = await withInfraTx(async (tx) => {
    const dz = tx as {
      execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const r = await dz.execute(sql`
      SELECT DISTINCT tenant_id FROM budgeting.recurring_rules
    `);
    return r.rows as Array<{ tenant_id: string }>;
  });
  if (tenantsRes.isErr()) throw tenantsRes.error;
  const tenants = tenantsRes.value;
  console.log(`scanned ${tenants.length} tenants owning recurring rules\n`);

  const plan: PlanItem[] = [];
  const skippedNoRate: PlanItem[] = [];
  let updated = 0;

  for (const { tenant_id } of tenants) {
    const r = await withTenantTx(
      TenantId(tenant_id),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const dz = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        // Unconfirmed recurring drafts for this tenant, joined to rule + budget.
        // Trust the RULE (0031 corrupted draft.currency_original).
        const drafts = await dz.execute(sql`
          SELECT el.id, el.tenant_id, el.transaction_date::text AS transaction_date,
                 el.currency_original,
                 el.amount_original_cents::text  AS amount_original_cents,
                 el.amount_converted_cents::text AS amount_converted_cents,
                 el.fx_rate::text AS fx_rate,
                 r.amount::text   AS rule_amount,
                 r.currency       AS rule_currency,
                 r.note           AS rule_note,
                 b.default_currency AS budget_currency
            FROM budgeting.expense_ledger el
            JOIN budgeting.recurring_rules r ON r.id = el.recurring_rule_id
            JOIN tenancy.budgets b ON b.id = el.tenant_id
           WHERE el.tenant_id = ${tenant_id}::uuid
             AND el.recurring_rule_id IS NOT NULL
             AND el.confirmed_at IS NULL
             AND el.deleted_at IS NULL
        `);

        let tenantUpdated = 0;
        for (const raw of drafts.rows) {
          const d = raw as unknown as DraftRow;
          const ruleAmtCents = Math.round(Number(d.rule_amount) * 100);
          const note = d.rule_note ?? "";

          if (d.rule_currency === d.budget_currency) {
            // Same-currency: must be budget-locked at ruleAmtCents, rate 1.
            const already =
              d.currency_original === d.budget_currency &&
              Number(d.amount_original_cents) === ruleAmtCents &&
              Number(d.amount_converted_cents) === ruleAmtCents &&
              Number(d.fx_rate) === 1;
            const item: PlanItem = {
              draftId: d.id,
              tenantId: tenant_id,
              ruleNote: note,
              ruleAmount: d.rule_amount,
              ruleCurrency: d.rule_currency,
              budget: d.budget_currency,
              storedCcy: d.currency_original,
              storedConvCents: d.amount_converted_cents,
              newConvCents: String(ruleAmtCents),
              rate: "1",
              action: already ? "skip-already-correct" : "lock-same-ccy",
            };
            plan.push(item);
            if (already) continue;
            if (APPLY) {
              await dz.execute(sql`
                UPDATE budgeting.expense_ledger
                   SET amount_original_cents  = ${ruleAmtCents}::bigint,
                       amount_converted_cents = ${ruleAmtCents}::bigint,
                       currency_original      = ${d.budget_currency},
                       fx_rate                = 1::numeric,
                       updated_at             = now()
                 WHERE id = ${d.id}::uuid
              `);
              tenantUpdated++;
            }
            continue;
          }

          // Cross-currency: re-convert from the rule via the REAL provider.
          let rate: string;
          try {
            const fx = await fxProvider.rateAsOf(
              d.rule_currency,
              d.budget_currency,
              new Date(toDateStr(d.transaction_date) + "T00:00:00Z"),
            );
            rate = fx.rate;
          } catch (e) {
            if (e instanceof NoFxRateAvailable) {
              skippedNoRate.push({
                draftId: d.id,
                tenantId: tenant_id,
                ruleNote: note,
                ruleAmount: d.rule_amount,
                ruleCurrency: d.rule_currency,
                budget: d.budget_currency,
                storedCcy: d.currency_original,
                storedConvCents: d.amount_converted_cents,
                newConvCents: "(no rate)",
                rate: "(no rate)",
                action: "skip-no-rate",
              });
              continue;
            }
            throw e;
          }
          const rateNum = Number(rate);
          if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6) {
            throw new Error(
              `FX rate out of bounds for ${d.rule_currency}->${d.budget_currency} @ ${d.transaction_date}: ${rate}`,
            );
          }
          const converted = Math.round(ruleAmtCents * rateNum);
          // Idempotency: a previously-backfilled cross-currency draft is already
          // budget-locked (currency_original = budget, orig = conv = converted,
          // fx_rate = 1). The RULE stays foreign, so we still recompute to detect
          // drift, but if the stored value already matches we SKIP (no rewrite,
          // no updated_at churn on re-run).
          const alreadyConverted =
            d.currency_original === d.budget_currency &&
            Number(d.amount_original_cents) === converted &&
            Number(d.amount_converted_cents) === converted &&
            Number(d.fx_rate) === 1;
          plan.push({
            draftId: d.id,
            tenantId: tenant_id,
            ruleNote: note,
            ruleAmount: d.rule_amount,
            ruleCurrency: d.rule_currency,
            budget: d.budget_currency,
            storedCcy: d.currency_original,
            storedConvCents: d.amount_converted_cents,
            newConvCents: String(converted),
            rate,
            action: alreadyConverted ? "skip-already-correct" : "convert",
          });
          if (alreadyConverted) continue;
          if (APPLY) {
            await dz.execute(sql`
              UPDATE budgeting.expense_ledger
                 SET amount_original_cents  = ${converted}::bigint,
                     amount_converted_cents = ${converted}::bigint,
                     currency_original      = ${d.budget_currency},
                     fx_rate                = 1::numeric,
                     updated_at             = now()
               WHERE id = ${d.id}::uuid
            `);
            tenantUpdated++;
          }
        }
        return tenantUpdated;
      },
    );
    if (r.isErr()) {
      console.error(`tenant ${tenant_id}: ERROR ${String(r.error)}`);
      continue;
    }
    updated += r.value;
  }

  // --- DRY-RUN report table --------------------------------------------------
  const needsWrite = plan.filter((p) => p.action !== "skip-already-correct");
  const orenda = plan.filter((p) =>
    p.ruleNote.toLowerCase().includes(ORENDA_MATCH),
  );
  const sample = [
    ...orenda,
    ...needsWrite.filter((p) => !orenda.includes(p)).slice(0, 10),
  ];

  const fmtCents = (c: string) =>
    c === "(no rate)" ? c : (Number(c) / 100).toFixed(2);
  console.log("Sample (Оренда first, then up to 10 representative rows):");
  console.log(
    [
      "ruleNote".padEnd(22),
      "ruleAmt".padStart(10),
      "ccy".padEnd(4),
      "budget".padEnd(7),
      "storedCcy".padEnd(10),
      "stored(maj)".padStart(12),
      "new(maj)".padStart(10),
      "rate".padStart(10),
      "action",
    ].join(" | "),
  );
  for (const p of sample) {
    console.log(
      [
        (p.ruleNote || "(none)").slice(0, 22).padEnd(22),
        p.ruleAmount.padStart(10),
        p.ruleCurrency.padEnd(4),
        p.budget.padEnd(7),
        p.storedCcy.padEnd(10),
        fmtCents(p.storedConvCents).padStart(12),
        fmtCents(p.newConvCents).padStart(10),
        p.rate.padStart(10),
        p.action,
      ].join(" | "),
    );
  }

  const byAction = plan.reduce<Record<string, number>>((acc, p) => {
    acc[p.action] = (acc[p.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nplan summary:", JSON.stringify(byAction));
  console.log(
    `rows needing a write: ${needsWrite.length} (convert: ${byAction["convert"] ?? 0}, lock-same-ccy: ${byAction["lock-same-ccy"] ?? 0})`,
  );
  console.log(`skipped (no FX rate): ${skippedNoRate.length}`);
  if (skippedNoRate.length > 0) {
    console.log("  no-rate drafts:");
    for (const s of skippedNoRate)
      console.log(
        `   draft=${s.draftId} tenant=${s.tenantId} rule="${s.ruleNote}" ${s.ruleAmount} ${s.ruleCurrency}->${s.budget} @ stored ${fmtCents(s.storedConvCents)}`,
      );
  }

  if (APPLY) {
    console.log(`\nAPPLIED: ${updated} drafts re-converted/locked.`);
  } else {
    console.log(
      `\nDRY-RUN only — no writes. Re-run with --apply to update ${needsWrite.length} drafts.`,
    );
  }
}

main().catch((e) => {
  console.error("[backfill-recurring-draft-fx] fatal:", e);
  process.exit(1);
});
