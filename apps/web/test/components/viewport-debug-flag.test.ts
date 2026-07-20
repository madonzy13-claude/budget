/**
 * viewport-debug-flag.test.ts — vpdbg flag persistence.
 *
 * Standalone PWA has no URL bar and its localStorage is separate from
 * Safari's, so the only way in is a deep link carrying ?vpdbg=1 — the flag
 * must then PERSIST so the overlay is already on at the next cold start
 * (the bug under investigation only fires on the first touch after reload).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { persistVpdbgFromUrl } from "../../src/components/common/viewport-debug";

describe("persistVpdbgFromUrl", () => {
  beforeEach(() => localStorage.clear());

  it("?vpdbg=1 turns the persisted flag on", () => {
    persistVpdbgFromUrl("?foo=2&vpdbg=1");
    expect(localStorage.getItem("vpdbg")).toBe("1");
  });

  it("?vpdbg=0 turns the persisted flag off", () => {
    localStorage.setItem("vpdbg", "1");
    persistVpdbgFromUrl("?vpdbg=0");
    expect(localStorage.getItem("vpdbg")).toBe("0");
  });

  it("no param leaves the flag untouched", () => {
    localStorage.setItem("vpdbg", "1");
    persistVpdbgFromUrl("?tab=wallets");
    expect(localStorage.getItem("vpdbg")).toBe("1");
  });
});
