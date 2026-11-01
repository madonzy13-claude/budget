/**
 * relative-ago.test.ts — R6 (user): "updated 5 minutes ago" under every
 * wallet and asset, in the viewer's language.
 */
import { describe, it, expect } from "vitest";
import { relativeAgo } from "../../src/lib/relative-ago";

const now = new Date("2026-11-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("relativeAgo", () => {
  it("under a minute is null (the caller says 'just now')", () => {
    expect(relativeAgo(ago(30_000), now, "en")).toBeNull();
  });
  it("picks the largest whole unit", () => {
    expect(relativeAgo(ago(5 * 60_000), now, "en")).toBe("5 minutes ago");
    expect(relativeAgo(ago(3 * 3_600_000), now, "en")).toBe("3 hours ago");
    expect(relativeAgo(ago(26 * 3_600_000), now, "en")).toBe("yesterday");
    expect(relativeAgo(ago(40 * 86_400_000), now, "en")).toBe("last month");
    expect(relativeAgo(ago(800 * 86_400_000), now, "en")).toBe("2 years ago");
  });
  it("speaks the viewer's language", () => {
    expect(relativeAgo(ago(5 * 60_000), now, "pl")).toBe("5 minut temu");
    expect(relativeAgo(ago(5 * 60_000), now, "uk")).toBe("5 хвилин тому");
  });
});
