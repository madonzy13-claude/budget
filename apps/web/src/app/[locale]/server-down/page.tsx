import { Suspense } from "react";
import { ServerDownCard } from "@/components/common/server-down-card";

/**
 * /[locale]/server-down — friendly "we can't reach the server" screen.
 *
 * Reached when the API container (Better Auth / Hono) is unreachable from the
 * web container. The (app)/layout.tsx catches `ServerUnavailableError` from
 * getServerSession() and redirects here instead of /sign-in, so the user gets
 * a clear "the server is down, here's a Retry" message rather than getting
 * bounced into a sign-in flow that itself depends on the API to work.
 *
 * Also wired as Serwist's navigation fallback (apps/web/sw.ts): when an
 * installed PWA loses connectivity AND the page is not in the cache, the
 * service worker serves this route from the precache instead of the browser's
 * default offline screen (which on iOS standalone PWAs renders as a blank
 * black viewport — the original bug).
 *
 * Intentional design rules:
 *   - NO server fetches. The whole point is this screen must render even
 *     when nothing else can. Anything beyond next-intl message loading is
 *     out of bounds.
 *   - NO auth gate. Public route. Middleware leaves it alone.
 *   - All copy via next-intl. EN + PL + UK keys under `server_down`.
 */
interface ServerDownPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ServerDownPage({ params }: ServerDownPageProps) {
  const { locale } = await params;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--canvas-dark)] px-6 py-12 text-center text-[var(--body-on-dark)]">
      {/* Suspense boundary required because ServerDownCard reads
          `?next=...` via useSearchParams; without it Next.js bails the
          entire route out of static rendering. */}
      <Suspense fallback={null}>
        <ServerDownCard locale={locale} />
      </Suspense>
    </main>
  );
}
