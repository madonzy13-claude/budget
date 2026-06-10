#!/usr/bin/env bun
/**
 * replay-budgeting.ts — ad-hoc projection replay CLI (Plan 02-09, ENGR-14).
 *
 * Rebuilds budgeting.spending_by_category_month from expense_ledger for an operator-supplied
 * date range. DELETE+INSERT inside a single withTenantTx (atomic). Operator-only; no UI exposure
 * (T-2-09-07). Runs as app_role inside withTenantTx(SYSTEM_USER) so the tenant-isolation policy
 * still scopes the writes; per-tenant invocations are explicit.
 *
 * Usage:
 *   bun run replay:budgeting --from=YYYY-MM-DD --to=YYYY-MM-DD --tenant=<UUID>
 *   bun run replay:budgeting --from=YYYY-MM-DD --to=YYYY-MM-DD              # all tenants
 *   bun run replay:budgeting --help
 *
 * Required env: DATABASE_URL_APP, DATABASE_URL_WORKER (set via Infisical in dev/prod).
 *
 * Exits 0 on success with a one-line summary:
 *   [replay-budgeting] tenants=N monthsReplayed=M durationMs=D from=YYYY-MM-DD to=YYYY-MM-DD
 *
 * Exits 1 on missing/invalid args or any per-tenant error (logs error per tenant first).
 */
import { Pool } from "pg";

interface Args {
  from?: string;
  to?: string;
  tenant?: string;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = { help: false };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") {
      out.help = true;
      continue;
    }
    const m = /^--([a-zA-Z][a-zA-Z0-9_-]*)=(.+)$/.exec(raw);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "from") out.from = val;
    else if (key === "to") out.to = val;
    else if (key === "tenant") out.tenant = val;
  }
  return out;
}

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function printHelp(): void {
  console.log(
    [
      "replay-budgeting — rebuild spending_by_category_month from expense_ledger.",
      "",
      "Usage:",
      "  bun run replay:budgeting --from=YYYY-MM-DD --to=YYYY-MM-DD [--tenant=UUID]",
      "",
      "Options:",
      "  --from=YYYY-MM-DD   Inclusive start date for replay window (required).",
      "  --to=YYYY-MM-DD     Inclusive end date for replay window (required).",
      "  --tenant=UUID       Single tenant to replay (optional; default: all tenants).",
      "  --help, -h          Show this help.",
      "",
      "Required env: DATABASE_URL_APP, DATABASE_URL_WORKER.",
      "",
      "Operator-only; no UI exposure. T-2-09-07: explicit --from/--to required.",
    ].join("\n"),
  );
}

async function listAllTenants(): Promise<string[]> {
  // worker connection (NOBYPASSRLS but with cron-scan policy on accounts).
  const url = process.env.DATABASE_URL_WORKER;
  if (!url) throw new Error("DATABASE_URL_WORKER required");
  const pool = new Pool({
    connectionString: url,
    application_name: "budget-replay-cli",
  });
  try {
    const r = await pool.query<{ tenant_id: string }>(
      "SELECT DISTINCT tenant_id FROM budgeting.accounts",
    );
    return r.rows.map((row) => row.tenant_id);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.from || !args.to) {
    console.error("ERROR: --from and --to are required (use --help).");
    printHelp();
    process.exit(1);
  }
  if (!isISODate(args.from) || !isISODate(args.to)) {
    console.error("ERROR: --from / --to must be YYYY-MM-DD.");
    process.exit(1);
  }
  if (args.from > args.to) {
    console.error("ERROR: --from must be <= --to.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL_APP) {
    console.error("ERROR: DATABASE_URL_APP required.");
    process.exit(1);
  }

  // Lazy-import so --help works without DB connections / modules
  const { replayProjections } =
    await import("@budget/budgeting/src/application/replay-projections");
  const replay = replayProjections();

  const startedAt = Date.now();
  const tenants = args.tenant ? [args.tenant] : await listAllTenants();

  let totalMonths = 0;
  let failures = 0;
  for (const tenantId of tenants) {
    const r = await replay({
      tenantId,
      dateFrom: args.from!,
      dateTo: args.to!,
    });
    if (r.isOk()) {
      totalMonths += r.value.monthsReplayed;

      console.log(
        `[replay-budgeting] tenant=${tenantId} monthsReplayed=${r.value.monthsReplayed}`,
      );
    } else {
      failures++;

      console.error(`[replay-budgeting] tenant=${tenantId} ERROR:`, r.error);
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(
    `[replay-budgeting] tenants=${tenants.length} monthsReplayed=${totalMonths} durationMs=${durationMs} from=${args.from} to=${args.to}`,
  );

  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[replay-budgeting] fatal:", e);
  process.exit(1);
});
