import { Skeleton } from "@/components/ui/skeleton";

/**
 * WalletsSkeleton — the Wallets tab's first-paint skeleton.
 *
 * Shared (RSC-safe — pure markup, no hooks) so it is the SINGLE waiting layout
 * for the Wallets tab: rendered both by the client WalletsSectionedList while
 * `useWallets` is fetching AND by the BDP route's loading.tsx during the server
 * membership gate. Reusing the exact same component in both places is what stops
 * the listing→BDP transition flickering between two different skeletons before
 * the real data lands (260620) — loading.tsx and the cold client view are now
 * pixel-identical, so only one skeleton is ever seen.
 *
 * `reveal-delayed` keeps the whole skeleton invisible for 200ms so a warm cache
 * restore / fast gate replaces it before it ever shows — no scaffold flash.
 */
export function WalletsSkeleton({ label }: { label: string }) {
  return (
    <div className="reveal-delayed mx-auto w-full max-w-[1280px]">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2">
          <h3 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            {label}
          </h3>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[56px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px]"
            >
              <Skeleton className="h-4 w-2 shrink-0" />
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-24" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-10" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            </div>
          ))}
          <div className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--muted-foreground)]" />
        </section>
      </div>
    </div>
  );
}
