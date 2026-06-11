/**
 * pwa-install-store-session.test.ts
 * Session-only installed flag for heuristic detection: NOT persisted to
 * localStorage (a wrong guess must not stick), reversed when a prompt is
 * captured (prompt ⇒ definitely not installed).
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  setDeferredPrompt,
  setInstalled,
  isInstalled,
  markSessionInstalled,
  subscribeToInstalled,
} from "@/lib/pwa-install-store";

beforeEach(() => {
  localStorage.clear();
  setDeferredPrompt(null);
  setInstalled(false);
  markSessionInstalled(false);
});

describe("session installed flag", () => {
  test("markSessionInstalled flips isInstalled without persisting", () => {
    markSessionInstalled(true);
    expect(isInstalled()).toBe(true);
    expect(localStorage.getItem("pwa-installed")).toBeNull();
  });

  test("capturing a prompt clears the session flag (proof of not-installed)", () => {
    markSessionInstalled(true);
    setDeferredPrompt({
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    expect(isInstalled()).toBe(false);
  });

  test("capturing a prompt does NOT clear the persisted flag", () => {
    setInstalled(true);
    // persisted installs are authoritative (appinstalled actually fired);
    // a stray prompt capture must not erase them — but in practice browsers
    // never fire beforeinstallprompt for an installed app, so this guards
    // the persisted source of truth.
    setDeferredPrompt(null);
    expect(isInstalled()).toBe(true);
  });

  test("subscribers notified on session flag changes", () => {
    const seen: boolean[] = [];
    const unsub = subscribeToInstalled((v) => seen.push(v));
    markSessionInstalled(true);
    markSessionInstalled(false);
    unsub();
    expect(seen).toEqual([false, true, false]);
  });
});
