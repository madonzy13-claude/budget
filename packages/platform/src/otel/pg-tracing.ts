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
const QUERY_MARKER = "__budgetOtelQueryWrapped";
const CONNECT_MARKER = "__budgetOtelConnectWrapped";

type Queryable = { query: (...args: unknown[]) => unknown };

/**
 * Wraps .query on anything that has one — a Pool, or a Client checked out via
 * pool.connect(). Idempotent: pg reuses Client objects across checkouts, so
 * re-wrapping on every connect() would stack wrappers and report one query
 * several times.
 */
function wrapQueryable<T extends object>(target: T, poolName: string): T {
  const tagged = target as T & { [QUERY_MARKER]?: boolean };
  if (tagged[QUERY_MARKER]) return target;
  tagged[QUERY_MARKER] = true;

  const q = target as unknown as Queryable;
  const original = q.query.bind(q) as (...args: unknown[]) => unknown;

  q.query = function tracedQuery(...args: unknown[]) {
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

  return target;
}

/**
 * Instruments a pool AND every connection it hands out.
 *
 * Wrapping only pool.query is not enough: withTenantTx / withInfraTx go through
 * the Drizzle transaction helper in tx.ts, which takes a connection out of the
 * pool and runs every statement on the returned Client. Since most of this
 * application's DB work is transactional, that left the majority of queries
 * untraced — measured
 * 2026-08-17, GET /budgets/:id/overview/projection reported 1078ms with only
 * 173ms of session spans beneath it and 905ms unaccounted for.
 */
export function instrumentPool(pool: Pool, poolName: string): Pool {
  wrapQueryable(pool, poolName);

  const tagged = pool as Pool & { [CONNECT_MARKER]?: boolean };
  if (!tagged[CONNECT_MARKER] && typeof pool.connect === "function") {
    tagged[CONNECT_MARKER] = true;
    const originalConnect = pool.connect.bind(pool) as (
      ...a: unknown[]
    ) => unknown;

    (pool as { connect: unknown }).connect = function tracedConnect(
      ...args: unknown[]
    ) {
      // Callback form: hand it straight back rather than half-support it.
      if (args.length > 0) return originalConnect(...args);
      return Promise.resolve(originalConnect()).then((client) => {
        if (client && typeof (client as Queryable).query === "function") {
          wrapQueryable(client as object, poolName);
        }
        return client;
      });
    };
  }

  return pool;
}
