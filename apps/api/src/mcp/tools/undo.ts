import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  findWritesByCallOrBatch,
  listRecentWrites,
  markReverted,
  withUserContext,
  UNDO_WINDOW_DAYS,
  type WriteLogRow,
} from "@budget/platform";
import { UserId, ok, err, type Result } from "@budget/shared-kernel";
import { dispatch, type DispatchOptions, type DispatchResult } from "../dispatch";
import { fromMinorUnits } from "../money";
import { readTool, writeTool, toolOk, toolError, type McpCtx } from "./define";

/**
 * undo.ts — the agent reverts its own logged writes (D-11) through the app's
 * routes, so side effects (reserve task, recompute) follow. A row changed by
 * anyone since the agent's write is skipped, never clobbered.
 *
 * Rollback mode is import's all-or-nothing (D-15): every effect of the batch
 * is reverted, no changed-since skip (nothing else touched rows inside the
 * same call), and a category the batch created is hard-deleted with its data.
 *
 * Undo writes no log rows of its own, so an undo can never be undone.
 */
type Outcome = "reverted" | "skipped" | "not_undoable";
type Mode = "agent" | "rollback";

interface InverseCtx {
  mode: Mode;
  /** The call/batch being undone — a category is hard-deleted only by its own batch. */
  id: string;
  send(opts: DispatchOptions): Promise<DispatchResult>;
}

type Inverse = (row: WriteLogRow, c: InverseCtx) => Promise<Outcome>;
type Json = Record<string, any>;

/** Tools whose writes have no safe inverse (owner decisions, 15-01). */
const NOT_UNDOABLE = new Set([
  "budget_create",
  "confirm_scheduled_payment",
  "complete_task",
  "delete_scheduled_payment",
  "delete_investment_entry",
]);

const same = (a: Json | null, b: Json | null, keys: string[]) =>
  !!a && !!b && keys.every((k) => String(a[k] ?? "") === String(b[k] ?? ""));

/** Changed since the agent's write? Rollback never asks. */
const changed = (c: InverseCtx, now: Json | null, after: Json | null, keys: string[]) =>
  c.mode === "agent" && !same(now, after, keys);

const done = (r: DispatchResult): Outcome => {
  if (r.ok) return "reverted";
  throw Object.assign(new Error(`inverse_failed_${r.status}`), { body: r.body });
};

async function get(c: InverseCtx, path: string, budgetId: string): Promise<Json | null> {
  const r = await c.send({ method: "GET", path, budgetId });
  return r.ok ? (r.body as Json) : null;
}

const TXN_FIELDS = ["date", "category_id", "amount_original_cents", "currency_original", "note"];
const RULE_FIELDS = ["amount", "currency", "categoryId", "note", "cadence", "cadenceAnchor", "weeklyDow", "yearlyMonth", "endDate", "active"];

const txnPath = (b: string, id: string) => `/budgets/${b}/transactions/${id}`;
const catPath = (b: string, id: string) => `/budgets/${b}/categories/${id}`;
const rulesPath = (b: string) => `/budgets/${b}/scheduled-payments`;

async function rule(c: InverseCtx, b: string, id: string): Promise<Json | null> {
  const list = await get(c, rulesPath(b), b);
  return (list?.rules as Json[] | undefined)?.find((r) => r.id === id) ?? null;
}

async function walletBack(row: WriteLogRow, c: InverseCtx): Promise<Outcome> {
  const before = row.before as Json;
  const now = await get(c, `/wallets/${row.entityId}`, row.tenantId);
  if (!now || changed(c, now, row.after as Json, ["currentBalanceCents"])) return "skipped";
  return done(
    await c.send({
      method: "PUT",
      path: `/wallets/${row.entityId}/balance`,
      budgetId: row.tenantId,
      body: {
        amount: fromMinorUnits(before.currentBalanceCents, before.currency),
        currency: before.currency,
      },
    }),
  );
}

const INVERSES: Record<string, Partial<Record<WriteLogRow["op"], Inverse>>> = {
  transaction: {
    async create(row, c) {
      const now = (await get(c, txnPath(row.tenantId, row.entityId), row.tenantId))?.transaction;
      if (!now || changed(c, now, row.after as Json, TXN_FIELDS)) return "skipped";
      return done(await c.send({ method: "DELETE", path: txnPath(row.tenantId, row.entityId), budgetId: row.tenantId }));
    },
    async update(row, c) {
      const now = (await get(c, txnPath(row.tenantId, row.entityId), row.tenantId))?.transaction;
      if (!now || changed(c, now, row.after as Json, TXN_FIELDS)) return "skipped";
      const b = row.before as Json;
      return done(
        await c.send({
          method: "PATCH",
          path: txnPath(row.tenantId, row.entityId),
          budgetId: row.tenantId,
          body: {
            date: b.date,
            category_id: b.category_id,
            amount_original_cents: Number(b.amount_original_cents),
            currency_original: b.currency_original,
            note: b.note,
          },
        }),
      );
    },
    async delete(row, c) {
      const r = await c.send({ method: "POST", path: `${txnPath(row.tenantId, row.entityId)}/restore`, budgetId: row.tenantId });
      // Someone restored it already.
      if (r.status === 409 && c.mode === "agent") return "skipped";
      return done(r);
    },
  },

  wallet: { update: walletBack },
  wallet_balance: { update: walletBack },

  category_limit: {
    async update(row, c) {
      const after = row.after as Json;
      const before = row.before as Json | null;
      const month = after.month as string;
      const base = catPath(row.tenantId, row.entityId);
      const now = await get(c, `${base}/limits/effective?date=${month}-01`, row.tenantId);
      if (changed(c, now, after, ["normalAmount", "cushionAmount"])) return "skipped";
      const window = {
        effectiveFrom: `${month}-01`,
        singleMonth: month < new Date().toISOString().slice(0, 7),
      };
      const body = before
        ? {
            normalAmount: before.normalAmount,
            cushionAmount: before.cushionAmount,
            ...(before.needsAmount != null ? { needsAmount: before.needsAmount } : {}),
            ...(before.wantsAmount != null ? { wantsAmount: before.wantsAmount } : {}),
            ...(before.noLimit ? { noLimit: true } : {}),
            ...window,
          }
        : // No limit before: the app's own "No limit" segment for that month.
          { noLimit: true, normalAmount: "0", cushionAmount: "0", ...window };
      return done(await c.send({ method: "POST", path: `${base}/limits`, budgetId: row.tenantId, body }));
    },
  },

  category: {
    async create(row, c) {
      const path = catPath(row.tenantId, row.entityId);
      const now = await get(c, path, row.tenantId);
      if (!now || changed(c, now, row.after as Json, ["name"])) return "skipped";
      if (!now.archivedAt)
        done(await c.send({ method: "POST", path: `${path}/archive`, budgetId: row.tenantId, body: {} }));
      // Its data all belongs to this batch, so nothing of the user's goes with it.
      if (c.mode === "rollback" && row.batchId === c.id)
        return done(await c.send({ method: "DELETE", path, budgetId: row.tenantId }));
      return "reverted";
    },
    async update(row, c) {
      const path = catPath(row.tenantId, row.entityId);
      const now = await get(c, path, row.tenantId);
      const before = row.before as Json;
      const after = row.after as Json;
      if (!now || changed(c, now, after, ["name"]) || (c.mode === "agent" && !!now.archivedAt !== !!after.archivedAt))
        return "skipped";
      if (before.name !== after.name)
        done(await c.send({ method: "PATCH", path, budgetId: row.tenantId, body: { name: before.name } }));
      if (!!before.archivedAt !== !!after.archivedAt)
        done(
          await c.send({
            method: "POST",
            path: `${path}/${before.archivedAt ? "archive" : "unarchive"}`,
            budgetId: row.tenantId,
            body: {},
          }),
        );
      return "reverted";
    },
  },

  investment_entry: {
    async create(row, c) {
      const r = await c.send({
        method: "DELETE",
        path: `/budgets/${row.tenantId}/investments/entries/${row.entityId}`,
        budgetId: row.tenantId,
      });
      // Newer entries exist (D-09): the user's history is never rewritten.
      if (r.status === 409 && c.mode === "agent") return "skipped";
      return done(r);
    },
  },

  // Logged before its entries, so it comes up after they were deleted: the
  // last delete wipes the holding (Phase 13.1). Still there = someone added
  // to it since, and it stays.
  investment_asset: {
    async create(row, c) {
      const b = row.tenantId;
      for (const query of [undefined, { hidden: "1" }]) {
        const r = await c.send({ method: "GET", path: `/budgets/${b}/investments`, budgetId: b, ...(query ? { query } : {}) });
        if (r.ok && (r.body as { holdings: Json[] }).holdings.some((h) => h.id === row.entityId)) {
          if (c.mode === "agent") return "skipped";
          throw new Error("asset_still_has_entries");
        }
      }
      return "reverted";
    },
  },

  scheduled_payment: {
    async create(row, c) {
      const now = await rule(c, row.tenantId, row.entityId);
      if (!now) return c.mode === "rollback" ? "reverted" : "skipped";
      if (changed(c, now, row.after as Json, RULE_FIELDS)) return "skipped";
      return done(await c.send({ method: "DELETE", path: `${rulesPath(row.tenantId)}/${row.entityId}`, budgetId: row.tenantId }));
    },
    async update(row, c) {
      const now = await rule(c, row.tenantId, row.entityId);
      if (!now || changed(c, now, row.after as Json, RULE_FIELDS)) return "skipped";
      const b = row.before as Json;
      const edits = Object.fromEntries(RULE_FIELDS.map((k) => [k, b[k]]).filter(([, v]) => v !== undefined));
      return done(
        await c.send({
          method: "PATCH",
          path: `${rulesPath(row.tenantId)}/${row.entityId}`,
          budgetId: row.tenantId,
          body: { edits, applyToFuture: true },
        }),
      );
    },
  },
};

export interface UndoOutcome {
  reverted: number;
  skipped_changed_since: string[];
  not_undoable: string[];
  failed_inverses: Array<{ entity_type: string; entity_id: string; error: string }>;
}

/**
 * Undo one call or one import batch. Rows come newest-first, so investment
 * entries go newest-first and a batch's ledger rows are deleted before the
 * category that holds them.
 */
export async function undoCallOrBatch(
  ctx: McpCtx,
  id: string,
  opts: { mode: Mode; callId: string } = { mode: "agent", callId: crypto.randomUUID() },
): Promise<Result<UndoOutcome, "not_found" | "already_reverted" | "outside_undo_window">> {
  const rows = await withUserContext(UserId(ctx.who.userId), (tx) =>
    findWritesByCallOrBatch(tx, { userId: ctx.who.userId, clientId: ctx.who.clientId, id }),
  );
  if (rows.isErr()) throw rows.error;
  if (rows.value.length === 0) return err("not_found");
  const open = rows.value.filter((r) => !r.revertedAt);
  if (open.length === 0) return err("already_reverted");
  const newest = Math.max(...rows.value.map((r) => new Date(r.createdAt).getTime()));
  if (opts.mode === "agent" && newest < Date.now() - UNDO_WINDOW_DAYS * 86_400_000)
    return err("outside_undo_window");

  const c: InverseCtx = {
    mode: opts.mode,
    id,
    send: (o) => dispatch(ctx.app, ctx.who, o),
  };
  const out: UndoOutcome = { reverted: 0, skipped_changed_since: [], not_undoable: [], failed_inverses: [] };
  for (const row of open) {
    const inverse = INVERSES[row.entityType]?.[row.op];
    if (!inverse || (opts.mode === "agent" && NOT_UNDOABLE.has(row.tool))) {
      out.not_undoable.push(row.entityId);
      continue;
    }
    try {
      const o = await inverse(row, c);
      if (o === "reverted") {
        out.reverted++;
        const marked = await withUserContext(UserId(ctx.who.userId), (tx) =>
          markReverted(tx, [row.id], opts.callId),
        );
        if (marked.isErr()) throw marked.error;
      } else if (o === "skipped") out.skipped_changed_since.push(row.entityId);
      else out.not_undoable.push(row.entityId);
    } catch (e) {
      ctx.deps.logger.error({ err: e, entity: row.entityType, id: row.entityId }, "mcp undo inverse failed");
      out.failed_inverses.push({ entity_type: row.entityType, entity_id: row.entityId, error: (e as Error).message });
    }
  }
  return ok(out);
}

export function registerUndoTools(server: McpServer, ctx: McpCtx): void {
  readTool(
    server,
    ctx,
    "list_recent_writes",
    {
      description: `Your own writes from the last ${UNDO_WINDOW_DAYS} days, newest first, with their call_id for undo.`,
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
    },
    async ({ limit }, c) => {
      const rows = await withUserContext(UserId(c.who.userId), (tx) =>
        listRecentWrites(tx, { userId: c.who.userId, clientId: c.who.clientId, limit: 500 }),
      );
      if (rows.isErr()) throw rows.error;
      const calls = new Map<string, WriteLogRow[]>();
      for (const r of rows.value) calls.set(r.callId, [...(calls.get(r.callId) ?? []), r]);
      const writes = [...calls.values()].slice(0, limit).map((rs) => ({
        call_id: rs[0]!.callId,
        batch_id: rs[0]!.batchId,
        tool: rs[0]!.tool,
        created_at: rs[0]!.createdAt,
        entities: rs.map((r) => ({ entity_type: r.entityType, entity_id: r.entityId, op: r.op })),
        reverted: rs.every((r) => r.revertedAt),
        undoable: !NOT_UNDOABLE.has(rs[0]!.tool) && rs.some((r) => !r.revertedAt),
      }));
      return toolOk({ writes });
    },
  );

  writeTool(
    server,
    ctx,
    "undo",
    {
      description:
        "Undo one of your own writes by its call_id (from a write's answer or list_recent_writes), " +
        `within ${UNDO_WINDOW_DAYS} days. Anything the user changed since is left alone and reported ` +
        "in skipped_changed_since. Creating a budget, confirming a scheduled payment, completing a " +
        "task and deletes of scheduled payments or investment entries cannot be undone.",
      inputSchema: z.object({ id: z.uuid().describe("A call_id") }),
      annotations: { destructiveHint: true, idempotentHint: false },
      // Undo is not counted toward the daily entry cap.
      entryCount: () => 0,
    },
    async ({ id }, c) => {
      const r = await undoCallOrBatch(c, id, { mode: "agent", callId: c.callId });
      if (r.isErr()) return toolError(r.error);
      return { result: { ...r.value }, effects: [] };
    },
  );
}
