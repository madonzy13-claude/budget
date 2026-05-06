import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * error.ts — converts domain errors to appropriate HTTP responses.
 * T-01-07-07: maps known domain errors to i18n-keyed 4xx; unknown → 500.
 */
export const errorMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (e) {
    if (e instanceof HTTPException) throw e;

    const msg = (e as Error).message ?? "unknown";

    if (/PRIVATE workspaces/.test(msg)) {
      throw new HTTPException(409, { message: msg });
    }
    if (/default_currency is immutable/.test(msg)) {
      throw new HTTPException(409, { message: msg });
    }
    if (/Cannot leave as last owner/.test(msg)) {
      throw new HTTPException(409, { message: msg });
    }
    if (/Invalid locale|Invalid ISO-4217/.test(msg)) {
      throw new HTTPException(400, { message: msg });
    }
    if (/^Verify your email/.test(msg)) {
      throw new HTTPException(403, { message: msg });
    }

    console.error("[api] unhandled error", e);
    throw new HTTPException(500, { message: "internal error" });
  }
};
