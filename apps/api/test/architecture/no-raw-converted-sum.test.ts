// no-raw-converted-sum.test.ts — Phase 14 sentinel (RESEARCH Pitfall 2).
//
// expense_ledger.amount_converted_cents is in the budget currency AT WRITE
// time. Once the budget currency can change, any READ of it mixes currencies
// silently. Every read path converts at read time through budgeting.fx_convert
// (fx-sql.ts) instead. This test fails on any reference to the column outside
// the writers below — comments included: reword them rather than allowlist.
//
// apps/web is not scanned: it consumes the API's re-expressed DTO field.
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const SCAN = ["packages", "apps/api/src", "apps/worker/src"];
const COLUMN = "amount_converted_cents";

/** Writers keep the NOT NULL column filled at write time. `line` narrows a file to matching lines. */
const ALLOW: { file: string; reason: string; line?: RegExp }[] = [
  { file: "packages/budgeting/src/application/create-transaction.ts", reason: "writes the column on create" },
  { file: "packages/budgeting/src/application/edit-transaction.ts", reason: "rewrites the column on edit" },
  { file: "packages/budgeting/src/application/materialise-due-drafts.ts", reason: "writes drafts" },
  { file: "packages/budgeting/src/application/create-scheduled-payment.ts", reason: "back-fills drafts" },
  { file: "packages/budgeting/src/application/edit-and-confirm-scheduled-draft.ts", reason: "rewrites a draft on confirm" },
  { file: "packages/budgeting/src/application/scheduled-payment-engine-fx.ts", reason: "draft FX at write" },
  { file: "apps/worker/src/handlers/scheduled-payment-engine.ts", reason: "worker writes drafts" },
  { file: "packages/budgeting/src/adapters/persistence/expense-ledger-draft-repo.ts", reason: "draft writer" },
  { file: "packages/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo.ts", reason: "draft writer" },
  { file: "packages/budgeting/src/adapters/persistence/expense-ledger-draft-schema.ts", reason: "column definition" },
  { file: "packages/budgeting/src/domain/transaction.ts", reason: "entity field" },
  { file: "packages/platform/src/demo/manifest.ts", reason: "demo seed writer" },
  {
    file: "packages/budgeting/src/adapters/persistence/transaction-repo.ts",
    reason: "INSERT / UPDATE column lists only",
    line: /^\s*(amount_converted_cents, fx_rate, fx_as_of,|sql`amount_converted_cents = )/,
  },
  {
    file: "apps/api/src/routes/transactions.ts",
    reason: "wire DTO key carrying the re-expressed value",
    line: /^\s*amount_converted_cents: row\.amountConvertedCents,/,
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "test" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|sql)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("Ledger read paths never read stored converted cents", () => {
  test("no reference to amount_converted_cents outside the writers", () => {
    const offenders: string[] = [];
    for (const base of SCAN) {
      for (const abs of walk(join(ROOT, base))) {
        const file = relative(ROOT, abs);
        const allow = ALLOW.filter((a) => a.file === file);
        readFileSync(abs, "utf8")
          .split("\n")
          .forEach((text, i) => {
            if (!text.includes(COLUMN)) return;
            if (allow.some((a) => !a.line || a.line.test(text))) return;
            offenders.push(`${file}:${i + 1}: ${text.trim()}`);
          });
      }
    }
    expect(offenders, `read-time conversion missing at:\n${offenders.join("\n")}`).toEqual([]);
  });
});
