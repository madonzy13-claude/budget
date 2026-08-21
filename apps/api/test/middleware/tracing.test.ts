import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { Hono } from "hono";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { tracingMiddleware } from "../../src/middleware/tracing";

/**
 * Bun.serve() is not auto-instrumented by OpenTelemetry, so this middleware is
 * the ONLY thing that produces a server span. Without it the pg spans still get
 * exported but arrive parentless — you can see that a query was slow and never
 * which request ran it, which defeats the point of tracing over pg_stat_statements.
 */

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  // Without a context manager, context.with() does not propagate across awaits
  // and every child span is orphaned. NodeSDK registers this in production;
  // registering it here also proves AsyncLocalStorage propagation works on Bun,
  // which is the assumption the whole nesting design rests on.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

afterEach(() => exporter.reset());

function appWith(handler: Parameters<Hono["get"]>[1]) {
  const app = new Hono();
  app.use(tracingMiddleware());
  app.get("/budgets/:budgetId/overview", handler);
  return app;
}

describe("tracing middleware", () => {
  test("emits one server span per request", async () => {
    const app = appWith((c) => c.json({ ok: true }));

    await app.request("/budgets/abc/overview");

    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  test("names the span by method and ROUTE, not the concrete URL", async () => {
    const app = appWith((c) => c.json({ ok: true }));

    await app.request("/budgets/abc/overview");

    // "/budgets/abc/overview" would make every budget its own endpoint in the
    // dashboard and destroy the percentile aggregation.
    const [span] = exporter.getFinishedSpans();
    expect(span!.name).toBe("GET /budgets/:budgetId/overview");
  });

  test("records method, route and status code", async () => {
    const app = appWith((c) => c.json({ ok: true }));

    await app.request("/budgets/abc/overview");

    const [span] = exporter.getFinishedSpans();
    expect(span!.attributes["http.request.method"]).toBe("GET");
    expect(span!.attributes["http.route"]).toBe("/budgets/:budgetId/overview");
    expect(span!.attributes["http.response.status_code"]).toBe(200);
  });

  test("downstream work runs inside the span, so DB spans nest under the request", async () => {
    let sawSpanId: string | undefined;
    const app = appWith((c) => {
      sawSpanId = trace.getSpan(context.active())?.spanContext().spanId;
      return c.json({ ok: true });
    });

    await app.request("/budgets/abc/overview");

    const [span] = exporter.getFinishedSpans();
    expect(sawSpanId).toBeDefined();
    expect(sawSpanId).toBe(span!.spanContext().spanId);
  });

  test("a 5xx response marks the span as an error", async () => {
    const app = appWith((c) => c.json({ boom: true }, 500));

    await app.request("/budgets/abc/overview");

    const [span] = exporter.getFinishedSpans();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.attributes["http.response.status_code"]).toBe(500);
  });

  test("a 4xx response is NOT an error — it is the client's fault, not a service fault", async () => {
    const app = appWith((c) => c.json({ nope: true }, 404));

    await app.request("/budgets/abc/overview");

    const [span] = exporter.getFinishedSpans();
    expect(span!.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  test("a thrown handler still produces an ended, error-marked span", async () => {
    const app = appWith(() => {
      throw new Error("handler exploded");
    });

    // Hono's own error boundary catches handler throws and turns them into a
    // 500 response, so next() resolves rather than rejecting — the span is
    // marked via the status code path, not the catch block.
    const res = await app.request("/budgets/abc/overview");
    expect(res.status).toBe(500);

    // A span left unended never reaches the collector — the trace for the
    // request that failed would be exactly the one missing.
    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
  });

  test("a rejecting next() ends the span, records the exception, and rethrows", async () => {
    // Hono's error boundary converts handler throws into 500s, so the only way
    // to reach the middleware's catch is a next() that rejects outright — e.g.
    // if onError itself throws. Invoked directly so the branch is genuinely
    // exercised rather than incidentally passing via the status-code path.
    const mw = tracingMiddleware();
    const c = {
      req: {
        method: "GET",
        url: "http://localhost/budgets/abc/overview",
        routePath: "/budgets/:budgetId/overview",
      },
      res: { status: 200 },
    } as unknown as Parameters<typeof mw>[0];

    const boom = new Error("next rejected");
    await expect(
      mw(c, () => Promise.reject(boom)),
    ).rejects.toThrow("next rejected");

    // A span left unended never reaches the collector — the trace for the
    // request that failed would be exactly the one missing.
    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.events.some((e) => e.name === "exception")).toBe(true);
  });
});
