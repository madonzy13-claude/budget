import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { BootedDeps } from "../../boot";
import type { DispatchResult, InternalCaller } from "../dispatch";
import { checkRate } from "../limits";

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
