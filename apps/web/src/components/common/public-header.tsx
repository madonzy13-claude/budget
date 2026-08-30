import { BrandMark } from "@/components/common/brand-mark";
import { PublicLocaleSwitcher } from "@/components/common/public-locale-switcher";
import { HeaderThemeToggle } from "@/components/common/header-theme-toggle";

/**
 * public-header.tsx — the header every LOGGED-OUT page shares.
 *
 * Extracted because four pages carried a byte-identical copy and none of them
 * absorbed the top safe-area inset: with `viewport-fit=cover` the page extends
 * under the status bar in standalone mode, so on iOS the brand mark sat on top
 * of the clock and battery. The app shell has always handled this; the
 * logged-out pages never did, and the sign-in page is exactly where a new
 * device lands first.
 *
 * Same mechanism as the shell's header: prefer `--safe-top` (persisted
 * pre-paint by SafeAreaTopSync, because iOS reports `env(safe-area-inset-top)`
 * as 0 on the first frame of a PWA cold launch and only then resolves it — a
 * visible downward jump), falling back to `env()`, which is also the plain
 * browser-tab value of 0.
 */
export function PublicHeader({
  locale,
  /** Language + theme controls. Off for the brand-only pages (join, 404). */
  controls = true,
  className = "",
}: {
  locale: string;
  controls?: boolean;
  className?: string;
}) {
  return (
    <header
      // A class, not an inline style, so the declaration is assertable in a
      // component test — happy-dom drops a style attribute whose value it
      // cannot parse, and var()/env() are exactly that. The cascade result is
      // identical.
      className={`border-b border-[var(--hairline-dark)] pt-[var(--safe-top,env(safe-area-inset-top))] ${className}`}
    >
      <div
        className={`mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6 ${
          controls ? "justify-between" : ""
        }`}
      >
        <BrandMark href={`/${locale}`} />
        {controls && (
          <div className="flex items-center gap-2">
            <PublicLocaleSwitcher current={locale} />
            <HeaderThemeToggle />
          </div>
        )}
      </div>
    </header>
  );
}
