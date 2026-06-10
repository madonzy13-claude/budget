/**
 * sw-offline.ts — pure, side-effect-free offline/server-down logic for the
 * Serwist service worker (sw.ts). Kept separate so it can be unit-tested
 * (test/sw-offline.test.ts) WITHOUT executing the service-worker bootstrap
 * (`new Serwist(...)` + `addEventListeners()`), which requires a real
 * ServiceWorkerGlobalScope and crashes under happy-dom.
 *
 * Why these functions exist (05-18 — offline redirect loop fix):
 * Playwright's `context.setOffline(true)` does NOT make the service worker's own
 * `fetch()` reject, so the genuine network-failure branch is impossible to cover
 * end-to-end. These pure functions, driven with injected `fetch`/cache fakes,
 * are the deterministic regression guard.
 */

export const OFFLINE_FALLBACK_URL = "/offline.html";
export const SUPPORTED_LOCALES = ["en", "pl", "uk"] as const;

/**
 * Navigation strategy. Try the network with a timeout; on ANY failure — a
 * rejected fetch (offline / DNS / connect-refused / abort) OR a 5xx response —
 * return the static, non-redirecting offline document. NEVER fall back to a
 * stale cached page shell: that stale-shell fallback re-runs client-side
 * auth/locale logic against a dead server and bounces sign-in <-> home, which is
 * the offline redirect loop. A single failed dependency therefore yields exactly
 * one offline render and zero redirects.
 */
export async function handleNavigationRequest(
  request: Request,
  fetchFn: (req: Request) => Promise<Response>,
  makeOffline: (req: Request) => Promise<Response>,
  timeoutMs = 5_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(
      new Request(request, { signal: controller.signal }),
    );
    if (res.status >= 500) return await makeOffline(request);
    return res;
  } catch {
    return await makeOffline(request);
  } finally {
    clearTimeout(timer);
  }
}

function localeFromPath(pathname: string): string {
  const seg = pathname.split("/")[1];
  return seg && (SUPPORTED_LOCALES as readonly string[]).includes(seg)
    ? seg
    : "en";
}

/**
 * Build the offline / server-down response for a failed navigation.
 *
 * Returns the precached static /offline.html (a 503) with the originating path +
 * locale seeded onto `window.__OFFLINE_NEXT` / `window.__OFFLINE_LANG` (the SW
 * cannot mutate the doc's URL, so it injects a script the doc reads). If the
 * precache misses, return a minimal localized inline 503 so the user never sees
 * the browser's blank offline screen. NEVER returns a stale app/sign-in shell.
 */
export async function buildOfflineDocument(
  request: Request,
  matchOffline: (url: string) => Promise<Response | undefined>,
): Promise<Response> {
  let locale = "en";
  let nextPath = "/";
  try {
    const url = new URL(request.url);
    nextPath = url.pathname + url.search;
    locale = localeFromPath(url.pathname);
  } catch {
    /* keep defaults */
  }

  const cached = await matchOffline(OFFLINE_FALLBACK_URL);
  if (cached) {
    const body = await cached.text();
    const headers = new Headers(cached.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("retry-after", "5");
    const inject = `<script>window.__OFFLINE_NEXT=${JSON.stringify(
      nextPath,
    )};window.__OFFLINE_LANG=${JSON.stringify(locale)};</script>`;
    const patched = body.replace("<body>", `<body>${inject}`);
    return new Response(patched, { status: 503, headers });
  }

  const titles: Record<string, string> = {
    en: "We can't reach the server",
    pl: "Nie możemy połączyć się z serwerem",
    uk: "Не вдається з'єднатися із сервером",
  };
  const title = titles[locale] ?? titles.en;
  return new Response(
    `<!DOCTYPE html><html lang="${locale}"><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Budget</title><body style='margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#181a20;color:#eaecef;font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px'><div data-testid=server-down-card style='max-width:28rem'><h1 style='font-size:24px;font-weight:600;margin:0 0 12px'>${title}</h1><p style='font-size:14px;color:#848e9c;margin:0 0 24px'>Try again in a moment.</p><button data-testid=server-down-retry-button onclick='location.assign("/${locale}")' style='background:#fcd535;color:#181a20;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer'>Try again</button></div></body></html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "5",
      },
    },
  );
}
