/**
 * sw-offline.ts — pure, side-effect-free navigation strategy for the Serwist
 * service worker (sw.ts). Kept separate so it can be unit-tested
 * (test/sw-offline.test.ts) WITHOUT executing the service-worker bootstrap
 * (`new Serwist(...)` + `addEventListeners()`), which requires a real
 * ServiceWorkerGlobalScope and crashes under happy-dom.
 *
 * Robust-minimal offline (260614-q1v): the OLD strategy fell back to a STATIC
 * /offline.html 503 doc with a 3-probe /api/health recovery gate — a stuck
 * full-page screen that often needed an app restart. The NEW strategy is
 * "cached page offline":
 *   1. Try the network (with a timeout).
 *   2. 2xx/3xx/4xx (<500) → return it unchanged (auth redirects stay safe).
 *   3. throw OR 5xx → return the CACHED navigation document for this route, so
 *      a previously-VISITED route renders offline from cache.
 *   4. Cache MISS → return a MINIMAL, self-recovering inline 503 that reloads on
 *      online/focus/visibility — never a stuck doc, no /api/health gate.
 *
 * Playwright's `context.setOffline()` does NOT make the SW's own fetch reject, so
 * these injected-fake unit tests are the deterministic regression guard.
 */

export const SUPPORTED_LOCALES = ["en", "pl", "uk"] as const;

function localeFromPath(pathname: string): string {
  const seg = pathname.split("/")[1];
  return seg && (SUPPORTED_LOCALES as readonly string[]).includes(seg)
    ? seg
    : "en";
}

/**
 * Navigation strategy: network-first, fall back to the CACHED page.
 *
 * Try the network with a timeout. A 5xx (server up but erroring) or a thrown
 * fetch (offline / DNS / connect-refused / abort) is treated as unreachable:
 * return the cached navigation document for this exact request if one exists, so
 * visited routes render offline. Only when the cache MISSES do we return the
 * minimal self-recovering inline notice. 2xx/3xx/4xx pass through unchanged so
 * server-side auth redirects (307 → /sign-in, etc.) keep working.
 */
export async function handleNavigationRequest(
  request: Request,
  fetchFn: (req: Request) => Promise<Response>,
  matchCache: (req: Request) => Promise<Response | undefined>,
  makeInlineNotice: (req: Request) => Promise<Response> | Response,
  timeoutMs = 5_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let unreachable = false;
  try {
    const res = await fetchFn(
      new Request(request, { signal: controller.signal }),
    );
    // 5xx → server reachable but failing; treat as unreachable for navigation
    // so we render the last-known-good cached page instead of an error body.
    if (res.status < 500) return res;
    unreachable = true;
  } catch {
    unreachable = true;
  } finally {
    clearTimeout(timer);
  }

  if (unreachable) {
    const cached = await matchCache(request);
    if (cached) return cached;
    return await makeInlineNotice(request);
  }
  // Unreachable in practice — kept for exhaustiveness.
  return await makeInlineNotice(request);
}

/**
 * Build the minimal, self-recovering inline offline notice (503) used only when
 * the requested route is NOT in the cache. Localized title; inline JS reloads
 * the moment connectivity returns (online / focus / visibilitychange→visible)
 * and on a manual Try-again tap. NO /api/health probe gate — the reload goes
 * network-first through the SW, which renders the real page if the origin is
 * back, so there is never a stuck full-page screen requiring an app restart.
 */
export function buildInlineOfflineNotice(request: Request): Response {
  let locale = "en";
  try {
    locale = localeFromPath(new URL(request.url).pathname);
  } catch {
    /* keep default */
  }

  const titles: Record<string, string> = {
    en: "You're offline",
    pl: "Jesteś offline",
    uk: "Ви офлайн",
  };
  const bodies: Record<string, string> = {
    en: "This page isn't available offline yet. It will reload automatically when you reconnect.",
    pl: "Ta strona nie jest jeszcze dostępna offline. Załaduje się ponownie po przywróceniu połączenia.",
    uk: "Ця сторінка ще не доступна офлайн. Вона перезавантажиться автоматично після відновлення зв'язку.",
  };
  const retries: Record<string, string> = {
    en: "Try again",
    pl: "Spróbuj ponownie",
    uk: "Спробувати ще раз",
  };
  const title = titles[locale] ?? titles.en;
  const body = bodies[locale] ?? bodies.en;
  const retry = retries[locale] ?? retries.en;

  // Self-recovery script: reload on reconnect/focus/visibility, plus a manual
  // button. No health-probe gate — location.reload() is network-first via the SW.
  const recovery =
    "<script>(function(){var r=function(){location.reload()};" +
    "addEventListener('online',r);addEventListener('focus',r);" +
    "addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')r()});})();</script>";

  return new Response(
    `<!DOCTYPE html><html lang="${locale}"><meta charset=utf-8>` +
      `<meta name=viewport content="width=device-width,initial-scale=1"><title>Budget</title>` +
      `<body style='margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#181a20;color:#eaecef;font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px'>` +
      `<div data-testid=offline-inline-notice style='max-width:28rem'>` +
      `<h1 style='font-size:24px;font-weight:600;margin:0 0 12px'>${title}</h1>` +
      `<p style='font-size:14px;color:#848e9c;margin:0 0 24px'>${body}</p>` +
      `<button data-testid=offline-inline-retry onclick='location.reload()' style='background:#fcd535;color:#181a20;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer'>${retry}</button>` +
      `</div>${recovery}</body></html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "5",
      },
    },
  );
}
