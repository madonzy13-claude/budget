import { describe, test, expect } from "bun:test";
import {
  FX_FETCH_QUEUE,
  FX_FETCH_CRON,
} from "../../src/handlers/fx-daily-fetch";

/**
 * Rates must be refreshed hourly by the worker, because the API is now
 * cache-only and cannot fetch a missing rate itself. A once-a-day refresh would
 * leave the API serving a stale-flagged prior rate for up to 24h.
 *
 * The schedule lives in the handler module rather than inline in worker.ts's
 * main() so it can actually be asserted on.
 */
describe("FX fetch schedule", () => {
  test("runs hourly", () => {
    expect(FX_FETCH_CRON).toBe("0 * * * *");
  });

  test("keeps the original queue name", () => {
    // pg-boss schedules are keyed by queue name and persist in the database.
    // Renaming the queue would leave the OLD daily schedule row in place and
    // running, so the name stays put and only the cron changes.
    expect(FX_FETCH_QUEUE).toBe("fx-daily-fetch");
  });
});
