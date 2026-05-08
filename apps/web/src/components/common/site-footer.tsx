/**
 * Site footer — sits on canvas-dark with a hairline-dark top border.
 *
 * Single source of truth for marketing + auth + app surfaces. The whole app
 * uses the dark theme exclusively, so the footer stays on canvas with muted
 * type for the closing line.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
      data-testid="site-footer"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {year} Budget. Family budgeting and wealth tracker.</p>
        <p className="text-xs">Multi-currency. Multi-tenant. PWA-ready.</p>
      </div>
    </footer>
  );
}
