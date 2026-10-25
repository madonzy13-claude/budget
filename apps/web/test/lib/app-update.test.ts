/**
 * app-update.test.ts — when a stale app may reload itself, and how hard.
 *
 * user, 261023: deploys didn't reach the installed app. The app now asks the
 * server which build is current and reloads itself — but only at a moment the
 * person won't lose anything, and escalates to a clean reload (no service
 * worker, no cached files) when a plain reload brought the old build back.
 */
import { describe, it, expect } from "vitest";
import {
  formatBuild,
  readyToReload,
  nextUpdateStep,
  QUIET_MS,
} from "../../src/lib/app-update";

const NOW = 1_000_000;

describe("readyToReload", () => {
  it("reloads a stale app nobody has touched since it opened", () => {
    expect(
      readyToReload({ stale: true, busy: false, lastInputAt: null, now: NOW }),
    ).toBe(true);
  });

  it("leaves an up-to-date app alone", () => {
    expect(
      readyToReload({ stale: false, busy: false, lastInputAt: null, now: NOW }),
    ).toBe(false);
  });

  it("waits while someone is using it", () => {
    expect(
      readyToReload({ stale: true, busy: false, lastInputAt: NOW - 5_000, now: NOW }),
    ).toBe(false);
  });

  it("reloads once they've been idle long enough", () => {
    expect(
      readyToReload({ stale: true, busy: false, lastInputAt: NOW - QUIET_MS, now: NOW }),
    ).toBe(true);
  });

  it("never reloads mid-form or mid-save, however idle", () => {
    expect(
      readyToReload({ stale: true, busy: true, lastInputAt: null, now: NOW }),
    ).toBe(false);
  });
});

describe("nextUpdateStep", () => {
  it("tries a plain reload first", () => {
    expect(nextUpdateStep(null, "b2")).toBe("reload");
  });

  it("a newer build than the last attempt starts over with a plain reload", () => {
    expect(nextUpdateStep({ target: "b1", step: "clean" }, "b2")).toBe("reload");
  });

  it("escalates to a clean reload when the plain one brought the old build back", () => {
    expect(nextUpdateStep({ target: "b2", step: "reload" }, "b2")).toBe("clean");
  });

  it("stops after a clean reload so it can never loop", () => {
    expect(nextUpdateStep({ target: "b2", step: "clean" }, "b2")).toBe("stop");
  });
});

// user, 261023: the build stamp showed seconds and read like a log line.
describe("formatBuild", () => {
  it("shows the build time as a date and minutes, no seconds", () => {
    const s = formatBuild("2026-10-23 18:21:16", "en", "UTC");
    expect(s).toContain("18:21");
    expect(s).toContain("2026");
    expect(s).not.toContain(":16");
  });

  it("keeps a non-timestamp build id as it is", () => {
    expect(formatBuild("a1b2c3d", "en")).toBe("a1b2c3d");
  });
});
