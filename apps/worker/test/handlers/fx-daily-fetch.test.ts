/**
 * Unit tests for registerFxDailyFetch handler.
 * TDD RED: tests fail until implementation lands.
 */
import { describe, test, expect } from "bun:test";
import { registerFxDailyFetch } from "../../src/handlers/fx-daily-fetch";
import type { FxProvider } from "@budget/shared-kernel";

// Minimal PgBoss fake
class FakePgBoss {
  private handlers = new Map<string, (job: unknown) => Promise<unknown>>();

  async work(queue: string, handler: (job: unknown) => Promise<unknown>) {
    this.handlers.set(queue, handler);
  }

  async runHandler(queue: string, job: unknown = {}) {
    const h = this.handlers.get(queue);
    if (!h) throw new Error(`No handler for queue: ${queue}`);
    return h(job);
  }
}

// FxProvider spy
class SpyFxProvider implements FxProvider {
  calls: Array<{ from: string; to: string; date: Date }> = [];

  async rateAsOf(from: string, to: string, date: Date) {
    this.calls.push({ from, to, date });
    return { rate: "1", provider: "test", isStale: false };
  }
}

describe("registerFxDailyFetch", () => {
  test("registers handler on fx-daily-fetch queue", async () => {
    const boss = new FakePgBoss() as any;
    const spy = new SpyFxProvider();
    registerFxDailyFetch(boss, spy);
    // Handler should be registered - running it should not throw
    // With no DB data, pairs will be empty, so rateAsOf is called 0 times
    const result = await boss.runHandler("fx-daily-fetch");
    expect(result).toBeDefined();
    expect(result).toHaveProperty("fetched");
    expect(result).toHaveProperty("failed");
  });

  test("handler returns fetch/fail counts after running", async () => {
    const boss = new FakePgBoss() as any;
    const spy = new SpyFxProvider();
    registerFxDailyFetch(boss, spy);
    const result = await boss.runHandler("fx-daily-fetch") as { fetched: number; failed: number };
    expect(typeof result.fetched).toBe("number");
    expect(typeof result.failed).toBe("number");
    expect(result.fetched + result.failed).toBeGreaterThanOrEqual(0);
  });
});
