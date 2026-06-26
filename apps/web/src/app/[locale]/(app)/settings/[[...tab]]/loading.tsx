/**
 * Settings loading.tsx — instant-commit skeleton for the catch-all [[...tab]]
 * route. A `loading.tsx` is what makes an App Router soft-nav commit instantly
 * (a manual <Suspense> in the layout does NOT — see the BDP loading.tsx note); it
 * paints the moment the URL changes and <UserSettingsShell> swaps in once the
 * server session read resolves. Static markup (server fallback) reserving the
 * header + pill-bar + card geometry so the live shell fades in with no shift.
 */
export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      <header className="mb-6 space-y-2" aria-hidden="true">
        <div className="h-3 w-16 rounded bg-[var(--surface-elevated-dark)]" />
        <div className="h-7 w-40 rounded bg-[var(--surface-elevated-dark)]" />
      </header>
      <div className="mb-8 flex gap-2" aria-hidden="true">
        <div className="h-9 w-24 rounded-[var(--radius-pill)] bg-[var(--primary)]" />
        <div className="h-9 w-24 rounded-[var(--radius-pill)] bg-[var(--surface-elevated-dark)]" />
      </div>
      <div
        aria-hidden="true"
        className="h-48 rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]"
      />
    </main>
  );
}
