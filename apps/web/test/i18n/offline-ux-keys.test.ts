import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const KEYS = [
  "offline.readOnly",
  "offline.writeBlocked",
  "offline.indicator.tooltip",
  "offline.indicator.tooltipUnknown",
  "offline.indicator.ariaLabel",
  // 260731-osq: the offline-add DIALOG is gone — an offline add is queued and
  // announced by a bottom toast, and its row carries a retry marker.
  "grid.txn.pending.queued",
  "grid.txn.pending.badge",
];

const REMOVED_KEYS = ["grid.offlineDialog"];

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in acc) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe("Offline UX i18n keys", () => {
  const locales = [
    ["en", en],
    ["pl", pl],
    ["uk", uk],
  ] as const;
  for (const [locale, dict] of locales) {
    for (const k of KEYS) {
      it(`${locale} has ${k}`, () => {
        expect(typeof get(dict, k)).toBe("string");
      });
    }
    for (const k of REMOVED_KEYS) {
      it(`${locale} no longer carries ${k}`, () => {
        expect(get(dict, k)).toBeUndefined();
      });
    }
  }
});
