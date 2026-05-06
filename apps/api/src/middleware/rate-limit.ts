/**
 * rate-limit.ts — simple in-memory rate limiter.
 * D-13: 1/min cooldown for verification email resend per user/IP.
 * T-01-07-04: rate-limit middleware enforces 1/min per user/IP.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Checks rate limit and records the attempt.
 * @param key - unique key (e.g., `${userId}:resend-verification` or `${ip}:resend-verification`)
 * @param windowSec - window size in seconds
 * @param max - maximum requests allowed in the window
 * @returns true if request is allowed, false if rate limited
 */
export function checkAndRecord(
  key: string,
  windowSec: number,
  max: number,
): boolean {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= max) {
    return false;
  }

  entry.count += 1;
  return true;
}

/** Clears all rate limit entries (for testing). */
export function clearRateLimits(): void {
  store.clear();
}

import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * rateLimitMiddleware — factory that returns middleware for a specific endpoint.
 * Usage: app.post('/auth/resend-verification', rateLimitMiddleware({ windowSec: 60, max: 1 }))
 */
export function rateLimitMiddleware(opts: {
  windowSec: number;
  max: number;
}): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session");
    const userId = session?.user.id ?? "anonymous";
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("cf-connecting-ip") ??
      "unknown";
    const key = `${userId}:${ip}:${c.req.path}`;

    if (!checkAndRecord(key, opts.windowSec, opts.max)) {
      throw new HTTPException(429, {
        message: "Too many requests. Please wait before retrying.",
      });
    }

    await next();
  };
}
