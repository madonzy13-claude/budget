/**
 * OpenTelemetry tracing bootstrap.
 *
 * Strictly opt-in: nothing starts unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * bun:test, CI and a plain `make dev` all execute this same module, and a
 * tracer that started itself would (a) retry exports against a collector that
 * is not running and (b) monkey-patch node-postgres underneath the test suite.
 *
 * Bun notes — both verified, neither is a preference:
 *  - Bun cannot use Node's `--require` preload, so initialisation is
 *    programmatic and must run BEFORE the pg Pool is constructed for
 *    PgInstrumentation to patch it.
 *  - `Bun.serve()` is NOT auto-instrumented, so there is deliberately no HTTP
 *    instrumentation here. Server spans come from the Hono middleware in
 *    apps/api; without it you get DB spans with no parent request.
 *
 * Only PgInstrumentation is registered. auto-instrumentations-node pulls in
 * dozens of patchers whose Bun compatibility varies; this is the one that
 * answers the question we actually have ("which queries does this request run").
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export interface TracingOptions {
  /** Overrides OTEL_SERVICE_NAME. Pass the service's own name at its entrypoint. */
  serviceName?: string;
  serviceVersion?: string;
}

export interface TracingHandle {
  /** Flushes pending spans and stops the SDK. Never throws. */
  shutdown(): Promise<void>;
}

/** Default when nothing else is configured — never leave spans as 'unknown_service'. */
const DEFAULT_SERVICE_NAME = "budget";

let started: TracingHandle | null = null;

function endpoint(): string {
  return (process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "").trim();
}

/** True only when an OTLP endpoint is configured. This is the single on-switch. */
export function isTracingEnabled(): boolean {
  return endpoint().length > 0;
}

export function resolveServiceName(opts: TracingOptions = {}): string {
  const fromEnv = (process.env["OTEL_SERVICE_NAME"] ?? "").trim();
  return opts.serviceName ?? (fromEnv.length > 0 ? fromEnv : DEFAULT_SERVICE_NAME);
}

/**
 * Starts tracing, or returns null when it is not configured. Idempotent: a
 * second call returns the first handle rather than registering the pg patcher
 * twice (which would double-report every query).
 */
export function startTracing(opts: TracingOptions = {}): TracingHandle | null {
  if (!isTracingEnabled()) return null;
  if (started) return started;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: resolveServiceName(opts),
      ...(opts.serviceVersion
        ? { [ATTR_SERVICE_VERSION]: opts.serviceVersion }
        : {}),
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint().replace(/\/+$/, "")}/v1/traces`,
    }),
    instrumentations: [
      new PgInstrumentation({
        // The statement text is the whole point — it is what makes a slow span
        // actionable. Values stay out: pg sends parameters separately, and
        // enhancedDatabaseReporting would put them in the span.
        enhancedDatabaseReporting: false,
        requireParentSpan: false,
      }),
    ],
  });

  sdk.start();

  const handle: TracingHandle = {
    async shutdown() {
      try {
        await sdk.shutdown();
      } catch {
        // A collector that is down must never take the service with it.
      } finally {
        started = null;
      }
    },
  };

  started = handle;
  return handle;
}
