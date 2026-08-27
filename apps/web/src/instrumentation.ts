/**
 * instrumentation.ts — telemetry for the WEB tier.
 *
 * Lives in src/, NOT the project root: Next looks for this file beside `app/`,
 * and this project keeps app/ under src/. At the root it is silently ignored —
 * no error, no compiled output, no spans, which is exactly what happened first
 * time round.
 *
 * Why it exists (260827): a 3.71s document arrived and could not be explained.
 * Every tier that could be measured was ruled out with a number — the API's
 * slowest span in the window was 1,154ms, the document body came back in 234ms,
 * a service-worker install measured 2ms, a cold navigation 351ms — and the time
 * was still unaccounted for. `api` and `worker` emitted spans; `web` logged four
 * lines at boot and nothing per request.
 *
 * A BARE provider, with no auto-instrumentation. Next emits its own spans
 * through @opentelemetry/api — `render route`, `resolve page components`,
 * `generateMetadata` — so registering a provider is all that is required.
 *
 * @vercel/otel was tried first and reverted. It patches global fetch, and with
 * tracing ON the share-link join flow broke deterministically: 3/3 failures with
 * it, 2/2 passes on the SAME build with tracing off. Observability that changes
 * what it observes is worse than none. The cost of dropping it is the SSR→API
 * fetch spans; those calls are already visible from the api side.
 *
 * Strictly opt-in, like every other service: nothing starts unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set, so `make dev`, CI and the test suite are
 * untouched. `make obs-up` sets it, on web as well as api and worker.
 */
export async function register(): Promise<void> {
  // Next may call this on more than one runtime. Only the Node one can carry an
  // OTLP exporter; on edge there is nothing to speak through.
  if (process.env["NEXT_RUNTIME"] === "edge") return;
  const endpoint = (process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "").trim();
  if (!endpoint) return;

  const [{ NodeTracerProvider, BatchSpanProcessor }, { OTLPTraceExporter }] =
    await Promise.all([
      import("@opentelemetry/sdk-trace-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
    ]);
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } =
    await import("@opentelemetry/semantic-conventions");

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "budget-web" }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      ),
    ],
  });
  provider.register();
}
