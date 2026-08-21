import { describe, test, expect, afterEach } from "bun:test";
import { trace } from "@opentelemetry/api";
import {
  startTracing,
  isTracingEnabled,
  resolveServiceName,
} from "../src/otel/tracing";

/**
 * Tracing must be strictly opt-in. Every bun:test run, every CI job and every
 * dev shell boots the same code paths as production, so a tracer that starts
 * itself would try to reach a collector that is not there — and the pg
 * instrumentation would monkey-patch node-postgres underneath the test suite.
 * The OTLP endpoint being set is the ONLY thing that turns it on.
 */

const ENDPOINT = "OTEL_EXPORTER_OTLP_ENDPOINT";
const SERVICE = "OTEL_SERVICE_NAME";

const saved = { ...process.env };
afterEach(async () => {
  // startTracing() registers a GLOBAL tracer provider. Left in place it hijacks
  // every other test file in this process — otel-pg-tracing's spans would go to
  // this SDK's OTLP exporter instead of its in-memory one.
  trace.disable();
  process.env[ENDPOINT] = saved[ENDPOINT];
  process.env[SERVICE] = saved[SERVICE];
  if (saved[ENDPOINT] === undefined) delete process.env[ENDPOINT];
  if (saved[SERVICE] === undefined) delete process.env[SERVICE];
});

describe("OpenTelemetry tracing bootstrap", () => {
  test("is disabled when no OTLP endpoint is configured", () => {
    delete process.env[ENDPOINT];

    expect(isTracingEnabled()).toBe(false);
    expect(startTracing()).toBeNull();
  });

  test("an empty or whitespace endpoint counts as disabled", () => {
    process.env[ENDPOINT] = "   ";

    expect(isTracingEnabled()).toBe(false);
    expect(startTracing()).toBeNull();
  });

  test("starts and returns a shutdown handle when an endpoint is configured", async () => {
    process.env[ENDPOINT] = "http://localhost:4318";

    const handle = startTracing({ serviceName: "budget-test" });

    expect(handle).not.toBeNull();
    expect(typeof handle!.shutdown).toBe("function");

    // Shutting down must not throw even though no collector is listening —
    // a failed export must never take the service down with it.
    await handle!.shutdown();
  });

  test("starting twice returns the same handle rather than double-registering instrumentation", async () => {
    process.env[ENDPOINT] = "http://localhost:4318";

    const first = startTracing({ serviceName: "budget-test-once" });
    const second = startTracing({ serviceName: "budget-test-once" });

    expect(second).toBe(first);
    await first!.shutdown();
  });

  describe("service name", () => {
    test("prefers the explicit option", () => {
      process.env[SERVICE] = "from-env";
      expect(resolveServiceName({ serviceName: "explicit" })).toBe("explicit");
    });

    test("falls back to OTEL_SERVICE_NAME", () => {
      process.env[SERVICE] = "from-env";
      expect(resolveServiceName()).toBe("from-env");
    });

    test("falls back to a named default so spans are never attributed to 'unknown_service'", () => {
      delete process.env[SERVICE];
      expect(resolveServiceName()).toBe("budget");
    });
  });
});
