import { createHash } from "node:crypto";
import type { Context, Next } from "hono";
import { withTenantTx } from "../db/tx";
import { reserveIdempotency } from "./repo";
import { lookupIdempotency, insertIdempotency } from "./repo";
import { TenantId, UserId } from "@budget/shared-kernel";

/**
 * HTTP methods that can mutate state and should be protected by idempotency.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * IdempotencyDeps — injectable dependencies for testability.
 * Production usage: omit (defaults to real DB functions).
 * Test usage: pass mocked in-memory implementations.
 */
export interface IdempotencyDeps {
  withTenantTx: typeof withTenantTx;
  lookupIdempotency: typeof lookupIdempotency;
  insertIdempotency: typeof insertIdempotency;
  /** Optional so wiring that predates the claim still runs unchanged. */
  reserveIdempotency?: typeof reserveIdempotency;
}

/** How long a loser waits for the winner's response before giving up. */
const IN_FLIGHT_POLLS = 20;
const IN_FLIGHT_POLL_MS = 100;

/**
 * createIdempotencyMiddleware — factory that returns a Hono MiddlewareHandler.
 *
 * Placement: AFTER tenantGuard (Pitfall 2), BEFORE route handlers.
 *
 * Behaviour:
 * - GET/HEAD/OPTIONS: skipped.
 * - Mutating method without Idempotency-Key header: skipped (per EXPN-12: "accepts", not "requires").
 * - Mutating method with Idempotency-Key header:
 *   1. Compute scope_hash = sha256(tenantId|userId|route|key) — tenant + user scoped (T-2-03-01).
 *   2. Compute body_hash = sha256(body text) — body-mismatch detection (T-2-03-02).
 *      Body read via c.req.raw.clone().text() — LOCKED Hono v4.12+ strategy that leaves the
 *      original Request.body ReadableStream unconsumed so downstream zValidator('json', ...) works.
 *   3. Open withTenantTx; SELECT FOR UPDATE on scope_hash (race-safe — T-2-03-03):
 *      - Cache hit + body match → return cached (status, body) verbatim.
 *      - Cache hit + body mismatch → 422 idempotency_key_reused_with_different_body.
 *      - Cache miss → call next(); capture response; INSERT row.
 */
export function createIdempotencyMiddleware<
  E extends { Variables: { tenantId?: string; userId?: string } },
>(deps?: Partial<IdempotencyDeps>) {
  // Default to real implementations; tests override via deps
  const wtx = deps?.withTenantTx ?? withTenantTx;
  const lookup = deps?.lookupIdempotency ?? lookupIdempotency;
  const insert = deps?.insertIdempotency ?? insertIdempotency;
  // Optional so existing wiring and tests that predate the claim still run —
  // without it the middleware behaves exactly as it did before.
  const reserve = deps?.reserveIdempotency ?? reserveIdempotency;

  return async (c: Context<E>, next: Next): Promise<void | Response> => {
    // Skip non-mutating methods
    if (!MUTATING.has(c.req.method)) {
      return next();
    }

    const key = c.req.header("Idempotency-Key");
    // No header — proceed without idempotency (EXPN-12: "accepts" the header, not "requires")
    if (!key) {
      return next();
    }

    // The context the app ACTUALLY sets (260806): tenantGuard writes
    // `tenantIds` — an ARRAY, plural — and auth writes `session`. Nothing
    // anywhere sets the singular `tenantId`/`userId` this once read, so the
    // guard below short-circuited on every request and idempotency was never
    // on: shared_kernel.idempotency_keys is empty in a live database and a
    // repeated POST writes a second financial row. The singular names are still
    // accepted first, because that is what several tests and any future
    // middleware that sets them would provide.
    const tenantIds = c.get("tenantIds" as keyof E["Variables"]) as
      | string[]
      | undefined;
    const session = c.get("session" as keyof E["Variables"]) as
      | { user?: { id?: string } }
      | undefined;
    const tenantId =
      (c.get("tenantId" as keyof E["Variables"]) as string | undefined) ??
      tenantIds?.[0];
    const userId =
      (c.get("userId" as keyof E["Variables"]) as string | undefined) ??
      session?.user?.id;

    // Pre-auth routes have no tenantId/userId — skip silently
    if (!tenantId || !userId) {
      return next();
    }

    const route = c.req.path;

    // LOCKED body-survival strategy (Hono v4.12+ invariant, T-2-03-07):
    // Clone the underlying Web API Request and read text from the clone.
    // The original Request.body ReadableStream remains unconsumed, so
    // downstream zValidator('json', schema) → c.req.json() reads the original body intact.
    // DO NOT call c.req.text() or c.req.json() directly — those consume the cached body.
    const rawBody = await c.req.raw.clone().text();
    const bodyHash = sha256(rawBody);

    // scope_hash binds tenant + user + route + key (T-2-03-01, Pitfall 10)
    const scopeHash = sha256(`${tenantId}|${userId}|${route}|${key}`);

    // Stash raw body on context so handlers needing raw text avoid re-buffering.
    // This is a convenience; the locked strategy above preserves the original stream.

    c.set("idempotency_raw_body" as any, rawBody);

    // Phase 1: lookup (SELECT FOR UPDATE for race-safety)
    const lookupResult = await wtx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const cached = await lookup(tx, scopeHash);
        if (cached) {
          if (cached.bodyHash !== bodyHash) {
            return { kind: "mismatch" as const };
          }
          return {
            kind: "replay" as const,
            status: cached.responseStatus,
            body: cached.responseBodyJsonb,
          };
        }
        return { kind: "fresh" as const };
      },
    );

    if (lookupResult.isErr()) {
      throw lookupResult.error;
    }

    const decision = lookupResult.value;

    if (decision.kind === "mismatch") {
      // T-2-03-02: body-swap attack — Stripe canonical pattern
      return c.json(
        { error: "idempotency_key_reused_with_different_body" },
        422,
      );
    }

    if (decision.kind === "replay") {
      // Cache hit — return verbatim cached response
      return c.json(
        decision.body as Record<string, unknown>,
        decision.status as 200,
      );
    }

    // Claim the key BEFORE running the handler. Lookup-then-insert around it is
    // not enough: two concurrent duplicates both miss the lookup, both execute,
    // and both write — which is how a service worker re-issuing a POST recorded
    // one transaction twice (260806). Whoever loses the claim waits for the
    // winner's response instead of repeating its work.
    if (reserve) {
      const claim = await wtx(TenantId(tenantId), UserId(userId), (tx) =>
        reserve(tx, { scopeHash, bodyHash, tenantId, userId, route }),
      );
      if (claim.isOk() && claim.value === false) {
        // Someone else is running it. Poll briefly for their stored response —
        // the reservation row carries status 0 until it lands.
        for (let i = 0; i < IN_FLIGHT_POLLS; i++) {
          await new Promise((r) => setTimeout(r, IN_FLIGHT_POLL_MS));
          const again = await wtx(TenantId(tenantId), UserId(userId), (tx) =>
            lookup(tx, scopeHash),
          );
          const row = again.isOk() ? again.value : null;
          if (row && row.responseStatus > 0) {
            return c.json(
              row.responseBodyJsonb as Record<string, unknown>,
              row.responseStatus as 200,
            );
          }
        }
        // The winner never finished in time. Falling through would run the
        // handler a second time, which is the very thing this prevents, so say
        // so instead and let the caller retry with the same key.
        return c.json({ error: "idempotency_in_flight" }, 409);
      }
    }

    // Fresh request — body stream still unconsumed; hand control to downstream
    await next();

    // Capture response and persist (outside the SELECT FOR UPDATE tx to avoid long lock)
    const status = c.res.status;
    const respText = await c.res.clone().text();
    let body: unknown;
    try {
      body = JSON.parse(respText);
    } catch {
      body = respText;
    }

    // Only cache successful responses (2xx) to avoid caching transient errors
    if (status >= 200 && status < 300) {
      await wtx(TenantId(tenantId), UserId(userId), async (tx) => {
        await insert(tx, {
          scopeHash,
          bodyHash,
          tenantId,
          userId,
          route,
          responseStatus: status,
          responseBody: body,
        });
      });
    }
  };
}
