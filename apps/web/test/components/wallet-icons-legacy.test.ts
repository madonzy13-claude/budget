/**
 * wallet-icons-legacy.test.ts — the icon set must still resolve the keys the
 * old Possessions section wrote.
 *
 * Possessions moved from holdings to wallets on 260803 carrying their stored
 * icon key ("cash", "electronics", …). Those keys came from a separate
 * possession icon set; if the wallet set does not know them, every migrated
 * house and car silently loses its icon.
 */
import { describe, it, expect } from "vitest";
import { iconByName } from "../../src/components/budgeting/wallets-tab/wallet-customizer";

const LEGACY_POSSESSION_ICON_KEYS = [
  "home",
  "car",
  "electronics",
  "jewelry",
  "tools",
  "sport",
  "cash",
  "furniture",
  "art",
  "watch",
  "bike",
  "boat",
];

describe("wallet icon set", () => {
  it("resolves every icon key the possessions section could store", () => {
    for (const key of LEGACY_POSSESSION_ICON_KEYS) {
      expect(iconByName(key), `icon "${key}" is missing`).not.toBeNull();
    }
  });

  it("still returns null for an unknown key and for none", () => {
    expect(iconByName("definitely-not-an-icon")).toBeNull();
    expect(iconByName(null)).toBeNull();
  });
});
