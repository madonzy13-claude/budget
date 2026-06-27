/**
 * Settings loading.tsx — instant-commit skeleton for the catch-all [[...tab]]
 * route. A `loading.tsx` is what makes an App Router soft-nav commit instantly
 * (a manual <Suspense> in the layout does NOT — see the BDP loading.tsx note); it
 * paints the moment the URL changes and <UserSettingsShell> swaps in once the
 * server session read resolves.
 *
 * Mirrors the real shell: header + the SAME accordion card (General open showing
 * two field rows, then collapsed Profile / Security / Danger triggers) — same
 * classes as user-settings-shell.tsx / settings-accordion.tsx so the live shell
 * fades in with zero shift. NO pill bar (the page is no longer a pill carousel).
 */
const CARD =
  "overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]";
const BAR = "rounded bg-[var(--surface-elevated-dark)]";
const FIELD =
  "h-10 w-full rounded-[var(--radius-md)] border border-[var(--input)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)]";

export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      <header className="mb-6 space-y-2" aria-hidden="true">
        <div className={`h-3 w-16 ${BAR}`} />
        <div className={`h-7 w-40 ${BAR}`} />
      </header>

      <div aria-hidden="true" className={CARD}>
        {/* General — open: trigger row + two field rows (language + currency). */}
        <div className="px-6 py-4">
          <div className={`h-5 w-24 ${BAR}`} />
        </div>
        <div className="space-y-6 bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
          <div className="space-y-2">
            <div className={`h-4 w-28 ${BAR}`} />
            <div className={FIELD} />
          </div>
          <div className="space-y-2">
            <div className={`h-4 w-28 ${BAR}`} />
            <div className={FIELD} />
          </div>
        </div>

        {/* Profile / Security / Danger Zone — collapsed trigger rows. */}
        {["profile", "security", "danger"].map((k) => (
          <div
            key={k}
            className="flex items-center justify-between border-t border-[var(--hairline-on-dark)] px-6 py-4"
          >
            <div className={`h-5 w-24 ${BAR}`} />
            <div className={`h-4 w-4 ${BAR}`} />
          </div>
        ))}
      </div>
    </main>
  );
}
