import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { context, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import type { Pool } from "pg";
import { instrumentPool } from "../src/otel/pg-tracing";

/**
 * instrumentation-pg does not work under Bun (its require-in-the-middle patching
 * never fires), so these spans are the ONLY source of DB visibility in a trace.
 */

const exporter = new InMemorySpanExporter();

beforeEach(() => {
  // beforeEach + disable(), not beforeAll: the OTel API refuses to replace an
  // already-registered global provider, and otel-tracing.test.ts registers a
  // real SDK in the same process. Without resetting, these spans would be sent
  // to that SDK's OTLP exporter and never reach the in-memory one — the tests
  // pass alone and fail in the suite.
  trace.disable();
  context.disable();
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    }),
  );
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

afterEach(() => exporter.reset());

/** Minimal stand-in — the wrapper only ever touches .query. */
function fakePool(impl: (...args: unknown[]) => unknown): Pool {
  return { query: impl } as unknown as Pool;
}

describe("pg query spans", () => {
  test("records one CLIENT span per query, named by SQL verb", async () => {
    const pool = instrumentPool(
      fakePool(async () => ({ rows: [] })),
      "app",
    );

    await pool.query("SELECT id FROM budgeting.categories WHERE tenant_id = $1", [
      "t",
    ]);

    const [span] = exporter.getFinishedSpans();
    expect(span!.name).toBe("SELECT");
    expect(span!.attributes["db.system"]).toBe("postgresql");
    expect(span!.attributes["db.pool"]).toBe("app");
  });

  test("records the statement text but NEVER the parameter values", async () => {
    const pool = instrumentPool(
      fakePool(async () => ({ rows: [] })),
      "app",
    );

    await pool.query("SELECT * FROM identity.users WHERE email = $1", [
      "someone@example.com",
    ]);

    const [span] = exporter.getFinishedSpans();
    expect(span!.attributes["db.statement"]).toBe(
      "SELECT * FROM identity.users WHERE email = $1",
    );
    // Values are people's money and PII — they must not ride along in telemetry.
    expect(JSON.stringify(span!.attributes)).not.toContain("someone@example.com");
  });

  test("nests under the active span so queries attach to their request", async () => {
    const pool = instrumentPool(
      fakePool(async () => ({ rows: [] })),
      "app",
    );
    const parent = trace.getTracer("test").startSpan("GET /budgets/:id");

    await context.with(trace.setSpan(context.active(), parent), () =>
      pool.query("SELECT 1"),
    );
    parent.end();

    const spans = exporter.getFinishedSpans();
    const child = spans.find((s) => s.name === "SELECT")!;
    const root = spans.find((s) => s.name === "GET /budgets/:id")!;
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  test("accepts the config-object query form", async () => {
    const pool = instrumentPool(
      fakePool(async () => ({ rows: [] })),
      "worker",
    );

    await pool.query({ text: "UPDATE pgboss.job SET state = $1", values: ["a"] });

    const [span] = exporter.getFinishedSpans();
    expect(span!.name).toBe("UPDATE");
    expect(span!.attributes["db.statement"]).toBe(
      "UPDATE pgboss.job SET state = $1",
    );
  });

  test("a failing query ends the span, marks it, and still rejects", async () => {
    const boom = new Error("deadlock detected");
    const pool = instrumentPool(
      fakePool(() => Promise.reject(boom)),
      "app",
    );

    await expect(pool.query("SELECT 1")).rejects.toThrow("deadlock detected");

    // An unended span never reaches the collector — the failing query would be
    // exactly the one missing from the trace.
    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(2); // ERROR
  });

  test("instrumenting the same pool twice does not double-report", async () => {
    const pool = fakePool(async () => ({ rows: [] }));
    instrumentPool(pool, "app");
    instrumentPool(pool, "app");

    await pool.query("SELECT 1");

    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });
});

describe("pg spans inside transactions", () => {
  /**
   * Most of this application's DB work happens inside withTenantTx, which uses
   * appDb().transaction() -> pool.connect() -> client.query(). Wrapping only
   * pool.query left every transactional query untraced: GET
   * /budgets/:id/overview/projection showed 1078ms with 173ms of session spans
   * and 905ms of nothing, because all its real work was inside a transaction.
   */
  function poolWithClient() {
    const calls: string[] = [];
    const client = {
      query: async (config: unknown) => {
        calls.push(
          typeof config === "string"
            ? config
            : ((config as { text?: string }).text ?? ""),
        );
        return { rows: [], rowCount: 0, command: "SELECT", fields: [] };
      },
      release: () => {},
    };
    const pool = {
      query: async () => ({ rows: [], rowCount: 0, command: "SELECT", fields: [] }),
      connect: async () => client,
    } as unknown as Pool;
    return { pool, client, calls };
  }

  test("a query on a connect()-ed client produces a span", async () => {
    const { pool } = poolWithClient();
    instrumentPool(pool, "app");

    const client = await pool.connect();
    await client.query("SELECT 1 FROM budgeting.categories");

    const span = exporter.getFinishedSpans().find((s) => s.name === "SELECT");
    expect(span).toBeDefined();
    expect(span!.attributes["db.statement"]).toBe(
      "SELECT 1 FROM budgeting.categories",
    );
  });

  test("client spans nest under the active span, so tx work joins its request", async () => {
    const { pool } = poolWithClient();
    instrumentPool(pool, "app");
    const parent = trace.getTracer("test").startSpan("GET /overview/projection");

    await context.with(trace.setSpan(context.active(), parent), async () => {
      const client = await pool.connect();
      await client.query("SELECT 1");
    });
    parent.end();

    const spans = exporter.getFinishedSpans();
    const child = spans.find((s) => s.name === "SELECT")!;
    const root = spans.find((s) => s.name === "GET /overview/projection")!;
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  test("a client handed out twice is not double-wrapped", async () => {
    // pg reuses Client objects across checkouts; wrapping on every connect()
    // would stack wrappers and report one query N times.
    const { pool } = poolWithClient();
    instrumentPool(pool, "app");

    const a = await pool.connect();
    await a.query("SELECT 1");
    const b = await pool.connect();
    await b.query("SELECT 1");

    expect(exporter.getFinishedSpans().filter((s) => s.name === "SELECT")).toHaveLength(2);
  });
});
