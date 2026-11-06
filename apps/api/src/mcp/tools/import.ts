import type { McpServer } from "@modelcontextprotocol/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  deletePreview,
  getPreview,
  insertWriteLog,
  savePreview,
  withUserContext,
} from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import { toMinorUnits } from "../money";
import { MCP_LIMITS } from "../limits";
import type { DispatchResult } from "../dispatch";
import { writeTool, toolError, type McpCtx, type WriteCtx, type WriteEffect } from "./define";
import { undoCallOrBatch } from "./undo";
import { investmentTxnRow } from "./write-investments";
import { scheduledPaymentRow } from "./write-planning";

/**
 * Import (D-13..D-18): the agent turns any file into strict JSON rows of one
 * kind; the server never parses a format. import_preview checks every row and
 * saves nothing but the preview; import_commit writes all-or-nothing, rolling
 * back through the undo inverses on the first failure; import_undo reverts a
 * committed batch.
 */
const KINDS = [
  "transactions",
  "category_limits",
  "investment_entries",
  "wallet_balances",
  "scheduled_payments",
] as const;
type Kind = (typeof KINDS)[number];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const category = z.string().min(1).max(120).describe("Category id or name");

const ROW = {
  transactions: z.object({
    date,
    category,
    amount: z.string(),
    currency: z.string().length(3).optional(),
    note: z.string().max(2000).nullable().optional(),
  }),
  category_limits: z
    .object({
      category,
      month: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM"),
      amount: z.string().optional(),
      cushion_amount: z.string().optional(),
      no_limit: z.boolean().optional(),
    })
    .refine((r) => r.no_limit || r.amount !== undefined, "amount or no_limit"),
  investment_entries: investmentTxnRow,
  wallet_balances: z.object({
    wallet_id: z.uuid(),
    date,
    balance: z.string().regex(/^-?\d{1,13}(\.\d{1,4})?$/),
    currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  }),
  scheduled_payments: scheduledPaymentRow
    .omit({ category_id: true })
    .extend({ category: category.nullable().optional() }),
} satisfies Record<Kind, z.ZodType>;

/** A checked row as stored in the preview; `i` is its index in the agent's rows. */
type Stored = Record<string, unknown> & { i: number };
type Category = { id: string; name: string; currency: string };
type Issues = {
  duplicates: Array<{ index: number; duplicate_of: number | "existing" }>;
  unknown_categories: Array<{ name: string; rows: number[]; suggestions: string[] }>;
  fx_gaps: Array<{ index: number; currency: string; date: string }>;
  invalid_rows: Array<{ index: number; error: string }>;
  older_than_latest_entry: Array<{ index: number; latest: string }>;
  /** Informational: older wallet balances are not stored (15-01 decision b1). */
  history_not_stored: Array<{ index: number; wallet_id: string; date: string }>;
};
const BLOCKING = ["duplicates", "unknown_categories", "fx_gaps", "invalid_rows", "older_than_latest_entry"] as const;

/** Edit distance, for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

function suggest(name: string, cats: Category[]): string[] {
  const n = name.toLowerCase();
  return cats
    .map((c) => ({ name: c.name, l: c.name.toLowerCase() }))
    .filter((c) => c.l.includes(n) || n.includes(c.l) || distance(c.l, n) <= 2)
    .slice(0, 3)
    .map((c) => c.name);
}

/** "55.0000" → "55": rules store numeric(…,4); toMinorUnits takes 2 places. */
const trimZeros = (v: string) => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

async function body<T>(c: WriteCtx, path: string, budgetId: string): Promise<T | null> {
  const r = await c.dispatch({ method: "GET", path, budgetId });
  return r.ok ? (r.body as T) : null;
}

const categories = async (c: WriteCtx, b: string) =>
  (await body<{ categories: Category[] }>(c, `/budgets/${b}/categories`, b))?.categories ?? [];

/** Checks one kind's rows against the budget; returns the rows to store. */
async function check(
  c: WriteCtx,
  b: string,
  kind: Kind,
  rows: unknown[],
): Promise<{ stored: Stored[]; issues: Issues }> {
  const issues: Issues = {
    duplicates: [],
    unknown_categories: [],
    fx_gaps: [],
    invalid_rows: [],
    older_than_latest_entry: [],
    history_not_stored: [],
  };
  let stored: Stored[] = [];
  for (const [i, raw] of rows.entries()) {
    const p = ROW[kind].safeParse(raw);
    if (!p.success) {
      const e = p.error.issues[0]!;
      issues.invalid_rows.push({ index: i, error: `${e.path.join(".") || "row"}: ${e.message}` });
      continue;
    }
    // ponytail: every supported currency has 2 decimals, so EUR stands in
    // until the category's own currency is known.
    const row = p.data as Record<string, unknown>;
    const money = (["amount", "cushion_amount"] as const).filter((k) => typeof row[k] === "string");
    const bad = money
      .map((k) => toMinorUnits(row[k] as string, (row.currency as string | undefined) ?? "EUR"))
      .find((r) => r.isErr());
    if (bad?.isErr()) {
      issues.invalid_rows.push({ index: i, error: bad.error });
      continue;
    }
    const cents = Object.fromEntries(
      money.map((k) => [`${k}_cents`, toMinorUnits(row[k] as string, "EUR").unwrapOr(0)]),
    );
    stored.push({ i, ...row, ...cents });
  }

  // Categories by id or name; unknown names with suggestions (D-17).
  if (kind === "transactions" || kind === "category_limits" || kind === "scheduled_payments") {
    const cats = await categories(c, b);
    const unknown = new Map<string, number[]>();
    for (const r of stored) {
      const ref = r.category as string | null | undefined;
      if (ref == null) continue;
      const hit = cats.find((x) => x.id === ref || x.name.toLowerCase() === ref.trim().toLowerCase());
      if (hit) Object.assign(r, { category_id: hit.id, category_currency: hit.currency });
      else unknown.set(ref, [...(unknown.get(ref) ?? []), r.i]);
    }
    for (const [name, idx] of unknown)
      issues.unknown_categories.push({ name, rows: idx, suggestions: suggest(name, cats) });
  }

  if (kind === "transactions") {
    // Duplicates (D-16): same day + amount + currency + category, in the
    // budget already or earlier in this import.
    const key = (cat: string, cents: string, ccy: string) => `${cat}|${cents}|${ccy}`;
    const existing = new Map<string, Set<string>>();
    for (const d of new Set(stored.filter((r) => r.category_id).map((r) => r.date as string))) {
      const found = await body<{
        transactions: Array<{ category_id: string; amount_original_cents: string; currency_original: string }>;
      }>(c, `/budgets/${b}/transactions/search?from=${d}&to=${d}&limit=200`, b);
      existing.set(
        d,
        new Set((found?.transactions ?? []).map((t) => key(t.category_id, String(t.amount_original_cents), t.currency_original))),
      );
    }
    const seen = new Map<string, number>();
    for (const r of stored) {
      if (!r.category_id) continue;
      const ccy = ((r.currency as string | undefined) ?? (r.category_currency as string)).toUpperCase();
      const k = key(r.category_id as string, String(r.amount_cents), ccy);
      const first = seen.get(`${r.date}|${k}`);
      if (existing.get(r.date as string)?.has(k)) issues.duplicates.push({ index: r.i, duplicate_of: "existing" });
      else if (first !== undefined) issues.duplicates.push({ index: r.i, duplicate_of: first });
      else seen.set(`${r.date}|${k}`, r.i);
    }
    // FX gaps: a foreign row needs that day's rate (D-18).
    const rates = new Map<string, boolean>();
    for (const r of stored) {
      const ccy = (r.currency as string | undefined)?.toUpperCase();
      const to = r.category_currency as string | undefined;
      if (!ccy || !to || ccy === to) continue;
      const q = `from=${ccy}&to=${to}&date=${r.date}`;
      if (!rates.has(q)) rates.set(q, (await c.dispatch({ method: "GET", path: `/fx/rate?${q}`, budgetId: b })).ok);
      if (!rates.get(q)) issues.fx_gaps.push({ index: r.i, currency: ccy, date: r.date as string });
    }
  }

  if (kind === "scheduled_payments") {
    const rules =
      (await body<{
        rules: Array<{ categoryId: string | null; amount: string; currency: string; note: string | null; nextDueDate: string }>;
      }>(c, `/budgets/${b}/scheduled-payments`, b))?.rules ?? [];
    const key = (cat: unknown, cents: unknown, ccy: string, note: unknown, d: string) =>
      `${cat ?? ""}|${cents}|${ccy}|${note ?? ""}|${d}`;
    const have = new Set(
      rules.map((x) => key(x.categoryId, toMinorUnits(trimZeros(x.amount), "EUR").unwrapOr(NaN), x.currency, x.note, x.nextDueDate)),
    );
    for (const r of stored)
      if (have.has(key(r.category_id, r.amount_cents, r.currency as string, r.note, r.first_due_date as string)))
        issues.duplicates.push({ index: r.i, duplicate_of: "existing" });
  }

  if (kind === "investment_entries") {
    // Phase 13.1's ledger only appends in time: store oldest first, so commit
    // writes oldest → newest and rollback deletes newest → oldest.
    stored = stored.sort((x, y) => (x.date as string).localeCompare(y.date as string));
    const latest = new Map<string, string | null>();
    for (const r of stored) {
      const id = r.asset_id as string | undefined;
      if (!id) continue;
      if (!latest.has(id)) {
        const found = await body<{ entries: Array<{ effectiveDate: string }> }>(
          c,
          `/budgets/${b}/investments/${id}/entries`,
          b,
        );
        latest.set(id, found ? (found.entries.map((e) => e.effectiveDate).sort().at(-1) ?? "") : null);
      }
      const last = latest.get(id);
      if (last === null) issues.invalid_rows.push({ index: r.i, error: "unknown_asset" });
      else if (last && (r.date as string) < last) issues.older_than_latest_entry.push({ index: r.i, latest: last });
    }
  }

  if (kind === "wallet_balances") {
    const wallets = (await body<{ wallets: Array<{ id: string }> }>(c, "/wallets", b))?.wallets ?? [];
    const live = new Set(wallets.map((w) => w.id));
    const newest = new Map<string, Stored>();
    for (const r of stored) {
      if (!live.has(r.wallet_id as string)) {
        issues.invalid_rows.push({ index: r.i, error: "unknown_or_archived_wallet" });
        continue;
      }
      const top = newest.get(r.wallet_id as string);
      if (!top || (r.date as string) >= (top.date as string)) newest.set(r.wallet_id as string, r);
    }
    for (const r of stored)
      if (live.has(r.wallet_id as string) && newest.get(r.wallet_id as string) !== r)
        issues.history_not_stored.push({ index: r.i, wallet_id: r.wallet_id as string, date: r.date as string });
    stored = [...newest.values()];
  }

  const invalid = new Set(issues.invalid_rows.map((x) => x.index));
  return { stored: stored.filter((r) => !invalid.has(r.i)), issues };
}

/**
 * Per-kind commit: the route, Idempotency-Key and logged entity of one row.
 * 15-20 fills the other four kinds.
 */
interface KindCommit {
  dispatchRow(c: WriteCtx, b: string, row: Stored, key: string): Promise<DispatchResult>;
  effect(b: string, row: Stored, r: DispatchResult): WriteEffect;
}
export const KIND_COMMIT: Partial<Record<Kind, KindCommit>> = {
  transactions: {
    dispatchRow: (c, b, row, key) =>
      c.dispatch({
        method: "POST",
        path: `/budgets/${b}/transactions`,
        budgetId: b,
        idempotencyKey: key,
        body: {
          date: row.date,
          category_id: row.category_id,
          amount_original_cents: row.amount_cents,
          ...(row.currency ? { currency_original: (row.currency as string).toUpperCase() } : {}),
          ...(row.note !== undefined ? { note: row.note } : {}),
        },
      }),
    effect: (b, _row, r) => {
      const txn = (r.body as { transaction: { id: string } }).transaction;
      return { tenantId: b, entityType: "transaction", entityId: txn.id, op: "create", before: null, after: txn, entryCount: 1, replayed: r.replayed };
    },
  },
};

const errorOf = (r: DispatchResult) => (r.body as { error?: string } | null)?.error ?? `http_${r.status}`;

export function registerImportTools(server: McpServer, ctx: McpCtx): void {
  writeTool(
    server,
    ctx,
    "import_preview",
    {
      description:
        "Check an import before saving it. Turn the user's file (any format) into rows of ONE kind: " +
        "transactions {date, category (id or name), amount, currency?, note?}; " +
        "category_limits {category, month YYYY-MM, amount | no_limit, cushion_amount?}; " +
        "investment_entries (same fields as record_investment_transaction); " +
        "wallet_balances {wallet_id, date, balance, currency} — only the newest balance per wallet is applied, older ones are not stored; " +
        "scheduled_payments (same fields as create_scheduled_payment, category by id or name). " +
        `At most ${MCP_LIMITS.maxRowsPerCall} rows per call. Nothing is saved. ` +
        "If clean, call import_commit without asking. If not, ask the user about ALL issues in one message, " +
        "then call import_commit with their answers as resolutions.",
      inputSchema: z.object({
        budget_id: z.uuid().describe("A budget_id from list_budgets"),
        kind: z.enum(KINDS),
        rows: z.array(z.unknown()).min(1),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      entryCount: () => 0,
    },
    async ({ budget_id: b, kind, rows }, c) => {
      if (rows.length > MCP_LIMITS.maxRowsPerCall)
        return toolError("too_many_rows", { max: MCP_LIMITS.maxRowsPerCall });
      const { stored, issues } = await check(c, b, kind, rows);
      const id = crypto.randomUUID();
      const saved = await withUserContext(UserId(c.who.userId), (tx) =>
        savePreview(tx, {
          id,
          tenantId: b,
          userId: c.who.userId,
          clientId: c.who.clientId,
          kind,
          payloadHash: createHash("sha256").update(JSON.stringify(stored)).digest("hex"),
          rows: stored,
          issues,
        }),
      );
      if (saved.isErr()) throw saved.error;
      return {
        result: {
          preview_id: id,
          clean: BLOCKING.every((k) => issues[k].length === 0),
          counts: { rows: rows.length, valid: stored.length },
          order: stored.map((r) => r.i),
          issues,
        },
        effects: [],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "import_commit",
    {
      description:
        "Save a checked import (from import_preview) all-or-nothing: if any row fails, everything this " +
        "import wrote is removed again. resolutions answers the preview's issues once: " +
        'duplicates "skip_all" | "add_all" | {add: [row indexes]}; category_map {name: existing category id | ' +
        '{create: {name}}} for every unknown category (never guess one); fx_gaps, older_than_latest_entry ' +
        'and invalid_rows "skip_rows". The answer has a batch_id for import_undo.',
      inputSchema: z.object({
        preview_id: z.uuid(),
        resolutions: z
          .object({
            duplicates: z.union([z.enum(["skip_all", "add_all"]), z.object({ add: z.array(z.number().int()) })]).optional(),
            category_map: z
              .record(z.string(), z.union([z.uuid(), z.object({ create: z.object({ name: z.string().min(1).max(120) }) })]))
              .optional(),
            fx_gaps: z.literal("skip_rows").optional(),
            older_than_latest_entry: z.literal("skip_rows").optional(),
            invalid_rows: z.literal("skip_rows").optional(),
          })
          .optional(),
      }),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ preview_id, resolutions: res = {} }, c) => {
      const me = { userId: c.who.userId, clientId: c.who.clientId };
      const got = await withUserContext(UserId(me.userId), (tx) => getPreview(tx, { id: preview_id, ...me }));
      if (got.isErr()) throw got.error;
      const p = got.value;
      if (!p) return toolError("preview_expired");
      const commit = KIND_COMMIT[p.kind as Kind];
      if (!commit) return toolError("kind_not_supported", { kind: p.kind });
      const b = p.tenantId;
      const issues = p.issues as Issues;
      const map = res.category_map ?? {};

      const missing = [
        ...(["duplicates", "fx_gaps", "older_than_latest_entry", "invalid_rows"] as const).filter(
          (k) => issues[k].length > 0 && !res[k],
        ),
        ...issues.unknown_categories.filter((u) => !(u.name in map)).map((u) => `category_map:${u.name}`),
      ];
      if (missing.length > 0) return toolError("unresolved_issues", { missing });

      const cats = new Set((await categories(c, b)).map((x) => x.id));
      const wrong = Object.entries(map).find(([, v]) => typeof v === "string" && !cats.has(v));
      if (wrong) return toolError("invalid_category_map", { name: wrong[0] });

      const add = typeof res.duplicates === "object" ? new Set(res.duplicates.add) : null;
      const skip = new Set([
        ...issues.duplicates.map((d) => d.index).filter((i) => res.duplicates !== "add_all" && !add?.has(i)),
        ...issues.fx_gaps.map((g) => g.index),
        ...issues.older_than_latest_entry.map((o) => o.index),
      ]);
      const rows = (p.rows as Stored[]).filter((r) => !skip.has(r.i));
      // Created category (lowercased) → the unknown names mapped to it.
      const creates = new Map<string, string[]>();
      for (const [from, v] of Object.entries(map))
        if (typeof v === "object") {
          const k = v.create.name.trim().toLowerCase();
          creates.set(k, [...(creates.get(k) ?? []), from]);
        }

      const refused = await c.preflight(rows.length + creates.size);
      if (refused) return refused;

      const batchId = crypto.randomUUID();
      const log = async (e: WriteEffect) => {
        const r = await withUserContext(UserId(me.userId), (tx) =>
          insertWriteLog(tx, [
            { ...e, userId: me.userId, clientId: me.clientId, callId: c.callId, batchId, tool: "import_commit" },
          ]),
        );
        if (r.isErr()) throw r.error;
      };
      const rollback = async (row_index: number | null, error: string) => {
        const undone = await undoCallOrBatch(c, batchId, { mode: "rollback", callId: c.callId });
        await withUserContext(UserId(me.userId), (tx) => deletePreview(tx, { id: preview_id, userId: me.userId }));
        const out = undone.isOk() ? undone.value : { reverted: 0, failed_inverses: [] };
        return toolError("import_rolled_back", {
          row_index,
          row_error: error,
          reverted: out.reverted,
          failed_inverses: out.failed_inverses,
        });
      };

      // Categories first (only the ones the user asked for — D-17), then rows.
      const mapped = new Map<string, string>(
        Object.entries(map).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
      );
      for (const [k, names] of creates) {
        const name = (map[names[0]!] as { create: { name: string } }).create.name;
        const r = await c.dispatch({
          method: "POST",
          path: `/budgets/${b}/categories`,
          budgetId: b,
          body: { name },
          idempotencyKey: `${preview_id}:category:${k}`,
        });
        if (!r.ok) return rollback(null, errorOf(r));
        const made = (r.body as { category: { id: string } }).category;
        await log({ tenantId: b, entityType: "category", entityId: made.id, op: "create", before: null, after: made, entryCount: 1, replayed: false });
        for (const n of names) mapped.set(n, made.id);
      }

      for (const [i, row] of rows.entries()) {
        const r = await commit.dispatchRow(
          c,
          b,
          { ...row, category_id: row.category_id ?? mapped.get(row.category as string) },
          `${preview_id}:${p.kind}:${i}`,
        );
        if (!r.ok) return rollback(row.i, errorOf(r));
        await log(commit.effect(b, row, r));
      }

      await withUserContext(UserId(me.userId), (tx) => deletePreview(tx, { id: preview_id, userId: me.userId }));
      return {
        result: {
          batch_id: batchId,
          created: rows.length,
          skipped: (p.rows as Stored[]).length - rows.length,
          categories_created: creates.size,
        },
        // Logged row by row above, with the batch id, so a rollback sees them.
        effects: [],
      };
    },
  );

  writeTool(
    server,
    ctx,
    "import_undo",
    {
      description:
        "Undo a whole committed import by its batch_id. Rows the user changed since are left alone and " +
        "reported; categories the import created are archived, not deleted.",
      inputSchema: z.object({ batch_id: z.uuid() }),
      annotations: { destructiveHint: true, idempotentHint: false },
      entryCount: () => 0,
    },
    async ({ batch_id }, c) => {
      const r = await undoCallOrBatch(c, batch_id, { mode: "agent", callId: c.callId });
      if (r.isErr()) return toolError(r.error);
      return { result: { ...r.value }, effects: [] };
    },
  );
}
