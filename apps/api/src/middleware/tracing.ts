/**
 * Server-span middleware.
 *
 * OpenTelemetry does not auto-instrument `Bun.serve()`, and apps/api is served
 * via `export default { fetch: app.fetch }` — so nothing upstream of Hono ever
 * opens a span. Without this middleware the pg spans are still exported but
 * arrive with no parent: you learn that a query was slow and never which
 * request ran it, which is the one thing pg_stat_statements already can't tell
 * you.
 *
 * Register FIRST in createApp so the span wraps every other middleware
 * (auth, tenant guard, idempotency) and their DB work lands inside the request.
 */
import type { MiddlewareHandler } from "hono";
import {
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  type Span,
} from "@opentelemetry/api";

const TRACER_NAME = "budget-api";

/**
 * Hono's matched route pattern (`/budgets/:budgetId/overview`), never the
 * concrete path. Using the raw URL would make every budget id its own endpoint
 * in the dashboard and destroy percentile aggregation.
 *
 * Only meaningful AFTER next(): inside a middleware registered with app.use(),
 * `routePath` is the MIDDLEWARE's own pattern ("/*"), because Hono resolves it
 * per matched handler. Reading it up front names every span "GET /*".
 */
function routeOf(c: Parameters<MiddlewareHandler>[0]): string {
  const matched = c.req.routePath;
  if (matched && matched !== "/*") return matched;
  return new URL(c.req.url).pathname;
}

function finish(span: Span, route: string, method: string, status: number): void {
  // Named here rather than at startSpan: the matched route is only known once
  // next() has run and Hono has dispatched to the handler.
  span.updateName(`${method} ${route}`);
  span.setAttribute("http.route", route);
  span.setAttribute("http.response.status_code", status);
  // Only 5xx is a service fault. A 404 or a 401 is the caller being wrong, and
  // marking those ERROR would drown the real error rate in expected traffic.
  if (status >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end();
}

export function tracingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    const span = trace.getTracer(TRACER_NAME).startSpan(`${method} ${path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": method,
        "url.path": path,
      },
    });

    try {
      // context.with makes this the ACTIVE span, which is what lets
      // PgInstrumentation attach its query spans as children.
      await context.with(trace.setSpan(context.active(), span), next);
      finish(span, routeOf(c), method, c.res.status);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      // End before rethrowing: an unended span is never exported, so the trace
      // for the request that actually failed would be the one missing.
      span.end();
      throw err;
    }
  };
}
