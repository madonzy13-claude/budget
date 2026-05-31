import { notFound } from "next/navigation";

/**
 * Catch-all under /[locale]. Any URL that did not match a real page
 * (e.g. /en/random-thing, /pl/foo/bar) lands here and we immediately
 * delegate to Next.js's notFound() helper, which renders the closest
 * `not-found.tsx` — for us that's [locale]/not-found.tsx (friendly,
 * localised, with a brand-mark header).
 *
 * Without this file Next.js falls back to the ROOT app/not-found.tsx
 * for unmatched URLs even when the locale segment partially matches,
 * which would strip out the next-intl provider and render the
 * hardcoded-English last-resort fallback instead of the localized one.
 */
export default function CatchAll(): never {
  notFound();
}
