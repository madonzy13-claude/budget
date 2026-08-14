/**
 * Manual pg query spans.
 *
 * @opentelemetry/instrumentation-pg patches node-postgres through
 * require-in-the-middle. Bun's module loader does not hook that, so the
 * instrumentation loads without error and silently produces NOTHING — verified
 * 2026-08-14 against a live collector: continuous pg-boss polling in the worker
 * and DB-backed auth requests in the API yielded zero db spans, while the
 * hand-written server spans came through fine.
 *
 * Wrapping Pool.query is explicit, has no runtime magic to break, and is what
 * makes a trace answer "which queries did this request run" — the one thing
 * pg_stat_statements structurally cannot tell you.
 */
import { trace, context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { Pool } from "pg";

const TRACER_NAME = "budget-pg";

/**
 * Span name = the leading SQL keywords, never the full statement. Span names are
 * a low-cardinality dimension: using the whole query would give every distinct
 * statement its own operation in the dashboard.
 */
function operationOf(sql: string): string {
  const verb = sql.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? "QUERY";
  return /^[A-Z]+$/.test(verb) ? verb : "QUERY";
}

function statementOf(query: unknown): string {
  if (typeof query === "string") return query;
  if (query && typeof query === "object" && "text" in query) {
    const text = (query as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

/**
 * Wraps pool.query so every statement becomes a CLIENT span, parented to
 * whatever span is active (the Hono server span, for a request).
 *
 * Idempotent — a second call on the same pool is ignored, so re-instrumenting a
 * singleton pool cannot double-report.
 */
export function instrumentPool(pool: Pool, poolName: string): Pool {
  const marker = "__budgetOtelInstrumented";
  const tagged = pool as Pool & { [marker]?: boolean };
  if (tagged[marker]) return pool;
  tagged[marker] = true;

  const original = pool.query.bind(pool) as (...args: unknown[]) => unknown;

  (pool as { query: unknown }).query = function tracedQuery(
    ...args: unknown[]
  ) {
    const statement = statementOf(args[0]);

    const span = trace.getTracer(TRACER_NAME).startSpan(operationOf(statement), {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": "postgresql",
        // The statement TEXT only. pg sends parameters separately and they are
        // deliberately not recorded — in this app they are people's money.
        "db.statement": statement,
        "db.pool": poolName,
      },
    });

    const finish = (err?: unknown) => {
      if (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    };

    try {
      const result = context.with(
        trace.setSpan(context.active(), span),
        () => original(...args) as unknown,
      );

      // pool.query supports both a promise and a callback form; only the
      // promise form is used here, but a thenable check keeps the wrapper
      // honest instead of assuming.
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return (result as Promise<unknown>).then(
          (value) => {
            finish();
            return value;
          },
          (err) => {
            finish(err);
            throw err;
          },
        );
      }

      finish();
      return result;
    } catch (err) {
      finish(err);
      throw err;
    }
  };

  return pool;
}
