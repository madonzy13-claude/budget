/**
 * middleware-https-upgrade.test.ts
 *
 * Reproducer for the iPhone-8 login loop: a PWA served over http could not keep
 * Better Auth's Secure session cookie, so it bounced back to /sign-in. The fix
 * upgrades http→https for real hosts. These tests pin shouldUpgradeToHttps.
 */

import { describe, test, expect } from "vitest";

import { shouldUpgradeToHttps } from "../src/lib/https-upgrade";

describe("shouldUpgradeToHttps", () => {
  test("upgrades a real host arriving over http (the iPhone-8 bug)", () => {
    expect(shouldUpgradeToHttps("http", "budget-dev.madonzy.com")).toBe(true);
  });

  test("does NOT upgrade when the edge already served https (no loop)", () => {
    expect(shouldUpgradeToHttps("https", "budget-dev.madonzy.com")).toBe(false);
  });

  test("does NOT upgrade when X-Forwarded-Proto is absent (no proxy)", () => {
    expect(shouldUpgradeToHttps(null, "budget-dev.madonzy.com")).toBe(false);
  });

  test("leaves loopback dev hosts on http", () => {
    expect(shouldUpgradeToHttps("http", "localhost:3000")).toBe(false);
    expect(shouldUpgradeToHttps("http", "127.0.0.1:3000")).toBe(false);
    expect(shouldUpgradeToHttps("http", "[::1]:3000")).toBe(false);
  });

  test("leaves tailscale (.ts.net) dev hosts on http", () => {
    expect(shouldUpgradeToHttps("http", "claude-code.tail4b2401.ts.net")).toBe(
      false,
    );
  });

  test("ignores a port when classifying the host", () => {
    expect(shouldUpgradeToHttps("http", "budget-dev.madonzy.com:443")).toBe(
      true,
    );
  });

  test("does not throw on an empty host", () => {
    expect(shouldUpgradeToHttps("http", "")).toBe(false);
  });
});
