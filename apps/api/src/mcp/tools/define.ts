import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { BootedDeps } from "../../boot";
import { insertWriteLog, withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";
import {
  dispatch,
  type DispatchOptions,
  type DispatchResult,
  type InternalCaller,
} from "../dispatch";
import { checkDailyEntries, checkRate } from "../limits";
import { present } from "./present";

/**
 * define.ts — the wrappers every MCP tool is registered through. Scope check,
 * per-connection rate limit and error mapping live here once, so a tool body
 * is only "dispatch to a route and shape the answer".
 */
export interface McpCtx {
  who: InternalCaller;
  scopes: string[];
  deps: BootedDeps;
  app: { fetch(r: Request): Response | Promise<Response> };
}

export interface ToolResult {
  [k: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function toolOk(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function toolError(
  code: string,
  extra: Record<string, unknown> = {},
): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: code, ...extra }) }],
    isError: true,
  };
}

/** D-20 / Pitfall 9: user-authored text is data for the agent, never orders. */
export function untrusted(
  s: string | null | undefined,
): { untrusted_user_text: string } | null {
  return s == null ? null : { untrusted_user_text: s };
}

/** A non-2xx route answer as a tool error carrying the route's own code. */
export function fromDispatch(r: DispatchResult): ToolResult {
  const body = r.body as { error?: unknown } | null;
  const code = typeof body?.error === "string" ? body.error : `http_${r.status}`;
  return toolError(code, { status: r.status });
}

type Handler<S extends z.ZodObject> = (
  args: z.infer<S>,
  ctx: McpCtx,
) => Promise<ToolResult>;

export function readTool<S extends z.ZodObject>(
  server: McpServer,
  ctx: McpCtx,
  name: string,
  def: { description: string; inputSchema: S },
  fn: Handler<S>,
): void {
  server.registerTool(
    name,
    {
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (async (args: z.infer<S>) => {
      if (!ctx.scopes.includes("read")) return toolError("insufficient_scope");
      if (!checkRate(ctx.who, "read"))
        return toolError("rate_limited", { retry_after_seconds: 60 });
      try {
        return await fn(args, ctx);
      } catch (e) {
        ctx.deps.logger.error({ err: e, tool: name }, "mcp tool failed");
        return toolError("internal_error");
      }
    }) as never,
  );
}

/** One entity a write tool changed — becomes one mcp_write_log row (D-08). */
export interface WriteEffect {
  tenantId: string;
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  before: unknown;
  after: unknown;
  entryCount: number;
  /** Answered from the idempotency cache: nothing ran, so nothing is logged. */
  replayed: boolean;
}

export interface WriteCtx extends McpCtx {
  callId: string;
  /** Daily-cap check for tools whose entry count is only known inside fn. */
  preflight(n: number): Promise<ToolResult | null>;
  /** dispatch() that refuses any mutation until a preflight has passed. */
  dispatch(opts: DispatchOptions): Promise<DispatchResult>;
}

export type WriteOutcome =
  | ToolResult
  | { result: Record<string, unknown>; effects: WriteEffect[]; currency?: string };

class PreflightRequired extends Error {}

/**
 * Every write tool goes through here: write scope (with an OAuth step-up
 * challenge), 20 writes/min, the 5000 entries/day cap BEFORE any mutation
 * (D-24, D-25), and the hidden write log after (D-08). Returns the wrapped
 * handler so a test can call it without a transport.
 */
export function writeTool<S extends z.ZodObject>(
  server: McpServer,
  ctx: McpCtx,
  name: string,
  def: {
    description: string;
    inputSchema: S;
    annotations?: { destructiveHint?: boolean; idempotentHint?: boolean };
    /** Entries this call writes; omit only when fn calls ctx.preflight itself. */
    entryCount?: (args: z.infer<S>) => number;
  },
  fn: (args: z.infer<S>, ctx: WriteCtx) => Promise<WriteOutcome>,
): (args: z.infer<S>) => Promise<ToolResult> {
  const handler = async (args: z.infer<S>): Promise<ToolResult> => {
    if (!ctx.scopes.includes("write"))
      return toolError("insufficient_scope", { required: "write" });
    if (!checkRate(ctx.who, "write"))
      return toolError("rate_limited", { retry_after_seconds: 60 });

    let preflighted = false;
    const preflight = async (n: number) => {
      const cap = await checkDailyEntries(ctx.who, n);
      if (cap.isErr()) return toolError("daily_entry_limit", { ...cap.error });
      preflighted = true;
      return null;
    };
    const callId = crypto.randomUUID();
    const wctx: WriteCtx = {
      ...ctx,
      callId,
      preflight,
      dispatch: (opts) => {
        if (opts.method !== "GET" && !preflighted) throw new PreflightRequired();
        return dispatch(ctx.app, ctx.who, opts);
      },
    };

    try {
      if (def.entryCount) {
        const refused = await preflight(def.entryCount(args));
        if (refused) return refused;
      }
      const out = await fn(args, wctx);
      if ("content" in out) return out;

      const effects = out.effects.filter((e) => !e.replayed);
      let undoAvailable = true;
      if (effects.length > 0) {
        const logged = await withUserContext(UserId(ctx.who.userId), (tx) =>
          insertWriteLog(
            tx,
            effects.map((e) => ({
              tenantId: e.tenantId,
              userId: ctx.who.userId,
              clientId: ctx.who.clientId,
              callId,
              batchId: null,
              tool: name,
              entityType: e.entityType,
              entityId: e.entityId,
              op: e.op,
              before: e.before,
              after: e.after,
              entryCount: e.entryCount,
            })),
          ),
        );
        // The write itself landed; never hide it because the log failed.
        if (logged.isErr()) {
          ctx.deps.logger.error({ err: logged.error, tool: name }, "mcp write log failed");
          undoAvailable = false;
        }
      }
      const shown = present(out.result, {
        fallbackCurrency: out.currency ?? "EUR",
      }) as Record<string, unknown>;
      return toolOk({
        call_id: callId,
        ...shown,
        ...(undoAvailable ? {} : { undo_available: false }),
      });
    } catch (e) {
      if (e instanceof PreflightRequired) return toolError("preflight_required");
      ctx.deps.logger.error({ err: e, tool: name }, "mcp tool failed");
      return toolError("internal_error");
    }
  };

  server.registerTool(
    name,
    {
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: def.annotations?.destructiveHint ?? false,
        idempotentHint: def.annotations?.idempotentHint ?? false,
      },
      // Read-only token → 403 insufficient_scope, so the client can step up.
      scopeChallenge: ({ authInfo }) =>
        authInfo && !authInfo.scopes.includes("write")
          ? { scopes: ["read", "write", "offline_access"] }
          : undefined,
    },
    handler as never,
  );
  return handler;
}
