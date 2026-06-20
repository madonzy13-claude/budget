import { Suspense } from "react";

/**
 * BDP layout — provides the no-layout-shift Suspense boundary for the catch-all
 * `[[...tab]]/page.tsx`, which suspends on its server membership gate. The
 * fallback reserves the EXACT sticky-band footprint (sticky wrapper + the BdpTabs
 * nav's h-12) so the real pills band (rendered by <BudgetDetail> once the gate
 * resolves) fades into reserved space with zero shift.
 *
 * Everything else — the pills band, the carousel, the tasks slider — now lives in
 * the single client <BudgetDetail> tree (see budget-detail.tsx). The old
 * BudgetShellData / PageTransition / per-tab routes are gone: tab switching is
 * pure client state with no per-tab RSC round-trip.
 *
 * Z-stack (locked): top-nav header z-50 · BDP sticky band z-40 · BudgetSwitcher
 * popover z-[60].
 */

interface BdpLayoutProps {
  children: React.ReactNode;
}

function BdpBandFallback() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
    >
      <div className="h-12" />
    </div>
  );
}

export default function BdpLayout({ children }: BdpLayoutProps) {
  return <Suspense fallback={<BdpBandFallback />}>{children}</Suspense>;
}
