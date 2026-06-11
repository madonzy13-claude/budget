/**
 * install-detect.test.ts
 * UAT-08 re-test gap: pre-existing installs (before appinstalled tracking
 * shipped) must still be detected on Chromium. Heuristic: Chromium browsers
 * fire beforeinstallprompt when the app is NOT installed; on a
 * service-worker-controlled page, silence within the probe window means the
 * app is already installed.
 */
import { describe, test, expect, vi } from "vitest";
import { shouldAssumeInstalled, isChromium } from "@/lib/install-detect";

function navWith(ua: string, brands?: { brand: string; version: string }[]) {
  return {
    userAgent: ua,
    ...(brands ? { userAgentData: { brands } } : {}),
  } as unknown as Navigator;
}

describe("isChromium", () => {
  test("true for Chrome UA", () => {
    expect(
      isChromium(
        navWith(
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        ),
      ),
    ).toBe(true);
  });

  test("true via userAgentData brands (Brave reports Chromium)", () => {
    expect(
      isChromium(
        navWith("Mozilla/5.0", [
          { brand: "Chromium", version: "130" },
          { brand: "Brave", version: "130" },
        ]),
      ),
    ).toBe(true);
  });

  test("false for Firefox", () => {
    expect(
      isChromium(
        navWith(
          "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
        ),
      ),
    ).toBe(false);
  });

  test("false for iOS Safari", () => {
    expect(
      isChromium(
        navWith(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ),
      ),
    ).toBe(false);
  });
});

describe("shouldAssumeInstalled", () => {
  const chromium = navWith(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  );

  test("true when Chromium + SW-controlled + no prompt captured", () => {
    expect(
      shouldAssumeInstalled({
        nav: chromium,
        swControlled: true,
        hasPrompt: false,
      }),
    ).toBe(true);
  });

  test("false when a prompt was captured (definitely not installed)", () => {
    expect(
      shouldAssumeInstalled({
        nav: chromium,
        swControlled: true,
        hasPrompt: true,
      }),
    ).toBe(false);
  });

  test("false on first visit (no SW controller yet)", () => {
    expect(
      shouldAssumeInstalled({
        nav: chromium,
        swControlled: false,
        hasPrompt: false,
      }),
    ).toBe(false);
  });

  test("false on non-Chromium browsers", () => {
    const firefox = navWith(
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    );
    expect(
      shouldAssumeInstalled({
        nav: firefox,
        swControlled: true,
        hasPrompt: false,
      }),
    ).toBe(false);
  });
});
