import type { Locale } from "@budget/identity";

/**
 * dispatch.ts — runs an MCP tool's request through the app's own route stack.
 *
 * Every tool is a thin call into an existing route, so auth, tenantGuard,
 * idempotency and the routes' side effects (reserve top-up sync, recompute
 * runners) are exactly what the web app gets (D-03).
 *
 * Identity travels in a WeakMap keyed on the Request object, which authMiddleware
 * reads before the cookie path. Only code in this process can register a
 * Request there, so no header from the network can claim to be internal.
 */
export interface InternalCaller {
  userId: string;
  clientId: string;
  email: string;
  locale: Locale;
}

export const internalRequests = new WeakMap<Request, InternalCaller>();

export interface DispatchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface DispatchOptions {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  budgetId?: string;
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string>;
}

export async function dispatch(
  app: { fetch(r: Request): Response | Promise<Response> },
  who: InternalCaller,
  opts: DispatchOptions,
): Promise<DispatchResult> {
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.budgetId) headers["x-budget-id"] = opts.budgetId;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  const req = new Request(`http://internal${opts.path}${qs}`, {
    method: opts.method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

  internalRequests.set(req, who);
  try {
    const res = await app.fetch(req);
    const text = await res.text();
    const isJson = res.headers.get("content-type")?.includes("json");
    const body = !text ? null : isJson ? JSON.parse(text) : text;
    return { ok: res.ok, status: res.status, body };
  } finally {
    internalRequests.delete(req);
  }
}
