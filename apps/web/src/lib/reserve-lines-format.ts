/**
 * reserve-lines-format.ts — the reserve amount as a locale list of
 * per-currency parts (Phase 14, UI-SPEC §6): "120 PLN and 15 EUR (≈ 64 PLN)".
 *
 * Money stays in cents strings into the existing formatter; the conjunction
 * ("and" / "i" / "і") comes from Intl.ListFormat, so no i18n key is needed.
 * Order is the server's (wallet currencies first, then the others).
 */
import { centsToBare } from "@/lib/cents-format";

export type ReserveLine = {
  currency: string;
  cents: string;
  equiv?: { currency: string; cents: string };
};

const part = (cents: string, currency: string, locale: string) =>
  `${centsToBare(cents.replace(/^-/, ""), locale)} ${currency}`;

export function formatReserveLines(lines: ReserveLine[], locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    lines.map(
      (l) =>
        part(l.cents, l.currency, locale) +
        (l.equiv ? ` (≈ ${part(l.equiv.cents, l.equiv.currency, locale)})` : ""),
    ),
  );
}
