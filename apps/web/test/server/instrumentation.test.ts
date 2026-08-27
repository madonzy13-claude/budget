/**
 * instrumentation.test.ts — the web tier had no telemetry at all.
 *
 * A 3.71s document arrived (user screenshot, 260827) and it could not be
 * explained. Everything measurable was ruled out with numbers — the API's
 * slowest span in the window was 1,154ms, the document body came back in 234ms,
 * a service-worker install measured 2ms, a cold navigation 351ms — and the time
 * was still unaccounted for. Only `api` and `worker` emitted spans; `web` logged
 * four lines at boot and nothing per request, so the one tier left holding the
 * answer was the one nobody could see.
 *
 * Next calls `register()` once per server start. Registering a tracer provider
 * there is enough: Next's own instrumentation then emits a span per render.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// A bare provider with NO auto-instrumentation. @vercel/otel was tried first and
// reverted: it patches global fetch, and with tracing ON the share-link join flow
// broke deterministically — 3/3 failures with it, 2/2 passes on the SAME build
// with tracing off. Next emits its own spans through @opentelemetry/api, so a
// registered provider is all that is actually required, and nothing global gets
// monkey-patched to get it.
const register_ = vi.hoisted(() => vi.fn());
vi.mock("@opentelemetry/sdk-trace-node", () => ({
  NodeTracerProvider: class {
    constructor(...args: unknown[]) {
      register_(...args);
    }
    register() {}
  },
  BatchSpanProcessor: class {},
}));
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: class {},
}));
const registerOTel = register_;

describe("web instrumentation register()", () => {
  const saved = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

  beforeEach(() => {
    registerOTel.mockClear();
    vi.resetModules();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    else process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = saved;
  });

  // Same on-switch as every other service: nothing starts unless an endpoint is
  // configured, so `make dev`, CI and the test suite stay untouched.
  test("does nothing when no OTLP endpoint is configured", async () => {
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    const { register } = await import("../../src/instrumentation");
    await register();
    expect(registerOTel).not.toHaveBeenCalled();
  });

  test("starts tracing under its own service name when one is", async () => {
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://otel-collector:4318";
    const { register } = await import("../../src/instrumentation");
    await register();
    expect(registerOTel).toHaveBeenCalledTimes(1);
    // Its own name, or its spans land indistinguishable from the API's — and
    // "which tier is slow" was the entire question.
    // Its own name lives on the resource; sharing the API's would make
    // "which tier is slow" — the entire question — unanswerable.
    const res = (
      registerOTel.mock.calls[0]![0] as {
        resource?: { attributes?: Record<string, unknown> };
      }
    )?.resource;
    expect(res?.attributes?.["service.name"]).toBe("budget-web");
  });

  // Next may call register() on more than one runtime; only the Node one has an
  // OTLP exporter to speak through.
  test("stays out of the edge runtime", async () => {
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://otel-collector:4318";
    process.env["NEXT_RUNTIME"] = "edge";
    try {
      const { register } = await import("../../src/instrumentation");
      await register();
      expect(registerOTel).not.toHaveBeenCalled();
    } finally {
      delete process.env["NEXT_RUNTIME"];
    }
  });
});
