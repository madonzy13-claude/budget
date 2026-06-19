# Server-Down → Cached-Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the API is unreachable, keep showing the cached app with a red "server unavailable — showing cached data" banner and go read-only, instead of redirecting to the full-page `/server-down` card — the same UX as offline.

**Architecture:** A new client `ConnectivityProvider` is the single source of truth (`online | offline | server-down`, offline taking precedence). `clientApiFetch` reports reachability through a tiny `api-unreachable-bus`; the provider confirms server-down with a `/api/health` probe and recovers by polling it. `OfflineStaleBar` and `OfflineReadOnly` consume the provider. `(app)/layout` renders the cached shell (instead of redirecting) when `ServerUnavailableError` is thrown and a session cookie is present.

**Tech Stack:** Next.js App Router (RSC + client islands), TanStack Query, next-intl, Vitest + happy-dom + RTL.

**Spec:** `docs/superpowers/specs/2026-06-19-server-down-cached-banner-design.md`

**Test runner:** from `apps/web/` — `bun run test <path>` (Vitest). Commit from repo root.

---

## File Structure

| File                                                       | Responsibility                                             | New/Modify |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------- |
| `apps/web/src/lib/api-unreachable-bus.ts`                  | framework-free pub/sub: report/subscribe API reachability  | Create     |
| `apps/web/src/lib/budget-fetch.ts`                         | `clientApiFetch` reports reachability                      | Modify     |
| `apps/web/src/components/common/connectivity-provider.tsx` | own connectivity status + health-probe + recovery          | Create     |
| `apps/web/src/components/providers/query-provider.tsx`     | mount `ConnectivityProvider` inside the QueryClient        | Modify     |
| `apps/web/src/components/common/offline-stale-bar.tsx`     | banner consumes provider; server-down wording              | Modify     |
| `apps/web/src/components/common/offline-read-only.tsx`     | block writes when degraded (offline OR server-down)        | Modify     |
| `apps/web/src/app/[locale]/(app)/layout.tsx`               | render degraded shell on `ServerUnavailableError` + cookie | Modify     |
| `apps/web/src/app/global.css`                              | mirror `is-offline` dim + bar-slot for `is-server-down`    | Modify     |
| `apps/web/messages/{en,pl,uk}.json`                        | `serverDown.banner.*` keys                                 | Modify     |
| `apps/web/test/...`                                        | tests per task                                             | Create     |

---

## Task 1: `api-unreachable-bus` pub/sub

**Files:**

- Create: `apps/web/src/lib/api-unreachable-bus.ts`
- Test: `apps/web/test/lib/api-unreachable-bus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/lib/api-unreachable-bus.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  reportApiUnreachable,
  reportApiOk,
  subscribeApiReachability,
} from "../../src/lib/api-unreachable-bus";

describe("api-unreachable-bus", () => {
  it("delivers 'unreachable' and 'ok' events to subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeApiReachability((e) => seen.push(e));
    reportApiUnreachable();
    reportApiOk();
    expect(seen).toEqual(["unreachable", "ok"]);
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const fn = vi.fn();
    const unsub = subscribeApiReachability(fn);
    unsub();
    reportApiUnreachable();
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports multiple independent subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeApiReachability(a);
    const ub = subscribeApiReachability(b);
    reportApiOk();
    expect(a).toHaveBeenCalledWith("ok");
    expect(b).toHaveBeenCalledWith("ok");
    ua();
    ub();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test test/lib/api-unreachable-bus.test.ts`
Expected: FAIL — cannot find module `api-unreachable-bus`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/api-unreachable-bus.ts
/**
 * api-unreachable-bus — framework-free pub/sub so the fetch layer (no React)
 * can tell ConnectivityProvider whether the API looks reachable, without a
 * circular import. "unreachable" = a network failure / timeout / 5xx was seen;
 * "ok" = a non-5xx response came back. The provider decides what to do (it
 * confirms server-down via a /api/health probe before flipping state).
 */
export type ApiReachability = "ok" | "unreachable";
type Listener = (event: ApiReachability) => void;

const listeners = new Set<Listener>();

export function reportApiUnreachable(): void {
  for (const l of [...listeners]) l("unreachable");
}

export function reportApiOk(): void {
  for (const l of [...listeners]) l("ok");
}

export function subscribeApiReachability(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test test/lib/api-unreachable-bus.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-unreachable-bus.ts apps/web/test/lib/api-unreachable-bus.test.ts
git commit -m "feat(connectivity): add api-unreachable-bus pub/sub"
```

---

## Task 2: `clientApiFetch` reports reachability

**Files:**

- Modify: `apps/web/src/lib/budget-fetch.ts`
- Test: `apps/web/test/lib/budget-fetch-reachability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/lib/budget-fetch-reachability.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clientApiFetch } from "../../src/lib/budget-fetch";
import { subscribeApiReachability } from "../../src/lib/api-unreachable-bus";

let events: string[];
let unsub: () => void;
beforeEach(() => {
  events = [];
  unsub = subscribeApiReachability((e) => events.push(e));
});
afterEach(() => {
  unsub();
  vi.unstubAllGlobals();
});

describe("clientApiFetch reachability reporting", () => {
  it("reports 'ok' on a 2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await clientApiFetch("/budgets/x/transactions");
    expect(events).toContain("ok");
    expect(events).not.toContain("unreachable");
  });

  it("reports 'ok' on a 4xx (API is up, just rejecting)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
    );
    await clientApiFetch("/budgets/x/transactions");
    expect(events).toEqual(["ok"]);
  });

  it("reports 'unreachable' on a 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("err", { status: 503 })),
    );
    await clientApiFetch("/budgets/x/transactions");
    expect(events).toContain("unreachable");
  });

  it("reports 'unreachable' when fetch rejects (network down)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(clientApiFetch("/budgets/x/transactions")).rejects.toThrow();
    expect(events).toContain("unreachable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test test/lib/budget-fetch-reachability.test.ts`
Expected: FAIL — no events recorded (reporting not wired).

- [ ] **Step 3: Modify `clientApiFetch`**

Replace the function body's final `return fetch(...)` so the whole function reads:

```ts
import { reportApiUnreachable, reportApiOk } from "./api-unreachable-bus";

// ...extractBudgetIdFromPath unchanged...

export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const budgetId = extractBudgetIdFromPath(window.location.pathname);
    if (budgetId && !headers.has("X-Budget-ID")) {
      headers.set("X-Budget-ID", budgetId);
    }
  }
  try {
    const res = await fetch(`/api${path}`, { ...init, headers });
    // 5xx ⇒ the server itself is failing; 2xx/3xx/4xx ⇒ the API is reachable
    // (4xx is auth/validation, NOT a server-down signal).
    if (res.status >= 500) reportApiUnreachable();
    else reportApiOk();
    return res;
  } catch (e) {
    // Network failure / abort / DNS — the API is unreachable.
    reportApiUnreachable();
    throw e;
  }
}
```

Add the import at the top of the file (after the existing header comment).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test test/lib/budget-fetch-reachability.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/budget-fetch.ts apps/web/test/lib/budget-fetch-reachability.test.ts
git commit -m "feat(connectivity): clientApiFetch reports API reachability"
```

---

## Task 3: `ConnectivityProvider` + `useConnectivity`

**Files:**

- Create: `apps/web/src/components/common/connectivity-provider.tsx`
- Test: `apps/web/test/components/connectivity-provider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/components/connectivity-provider.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConnectivityProvider,
  useConnectivity,
} from "../../src/components/common/connectivity-provider";
import {
  reportApiUnreachable,
  reportApiOk,
} from "../../src/lib/api-unreachable-bus";

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

function Probe() {
  const { status, degraded } = useConnectivity();
  return <div data-testid="s">{`${status}:${degraded}`}</div>;
}

function renderProbe() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectivityProvider>
        <Probe />
      </ConnectivityProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setOnline(true);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ConnectivityProvider", () => {
  it("starts online", () => {
    renderProbe();
    expect(screen.getByTestId("s").textContent).toBe("online:false");
  });

  it("offline takes precedence (navigator.onLine=false)", async () => {
    renderProbe();
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByTestId("s").textContent).toBe("offline:true");
  });

  it("enters server-down only after a failed /api/health probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
      await vi.runOnlyPendingTimersAsync();
    });
    await waitFor(() =>
      expect(screen.getByTestId("s").textContent).toBe("server-down:true"),
    );
  });

  it("does NOT enter server-down if the health probe succeeds (one-off endpoint error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByTestId("s").textContent).toBe("online:false");
  });

  it("reportApiOk clears server-down immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
      await vi.runOnlyPendingTimersAsync();
    });
    await waitFor(() =>
      expect(screen.getByTestId("s").textContent).toBe("server-down:true"),
    );
    await act(async () => {
      reportApiOk();
    });
    expect(screen.getByTestId("s").textContent).toBe("online:false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test test/components/connectivity-provider.test.tsx`
Expected: FAIL — cannot find module `connectivity-provider`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/common/connectivity-provider.tsx
"use client";
/**
 * ConnectivityProvider — single source of truth for connectivity:
 *   online | offline | server-down   (offline takes precedence).
 *
 * - offline:     navigator.onLine === false.
 * - server-down: navigator.onLine true BUT the API is unreachable. Entered only
 *   after a /api/health probe CONFIRMS it (so a lone 4xx / endpoint blip doesn't
 *   trip it). Recovered by polling /api/health; on 200 we go online and refetch.
 *
 * Detection feed: api-unreachable-bus (clientApiFetch reports network/5xx as
 * "unreachable", 2xx/3xx/4xx as "ok"). On cold reload the (app) layout renders
 * <ServerDownSeed/> which calls reportApiUnreachable() once.
 *
 * Mirrors offline's online-event recovery (invalidateQueries) so the cached UI
 * refreshes the moment the API returns.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeApiReachability } from "@/lib/api-unreachable-bus";

export type ConnectivityStatus = "online" | "offline" | "server-down";

interface ConnectivityValue {
  status: ConnectivityStatus;
  degraded: boolean;
  reason: ConnectivityStatus;
}

const ConnectivityContext = createContext<ConnectivityValue>({
  status: "online",
  degraded: false,
  reason: "online",
});

export function useConnectivity(): ConnectivityValue {
  return useContext(ConnectivityContext);
}

const HEALTH_TIMEOUT_MS = 4_000;
const RECOVERY_POLL_MS = 7_000;

async function probeHealth(): Promise<boolean> {
  try {
    // Raw fetch (NOT clientApiFetch) so the probe never feeds the bus itself.
    const res = await fetch("/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [networkOnline, setNetworkOnline] = useState(true);
  const [serverDown, setServerDown] = useState(false);
  const probing = useRef(false);

  // navigator.onLine + listeners.
  useEffect(() => {
    setNetworkOnline(navigator.onLine);
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // React to API reachability reports.
  useEffect(() => {
    return subscribeApiReachability(async (event) => {
      if (event === "ok") {
        setServerDown(false);
        return;
      }
      // "unreachable": confirm with a health probe before flipping.
      if (navigator.onLine === false) return; // offline owns this case
      if (probing.current) return;
      probing.current = true;
      const ok = await probeHealth();
      probing.current = false;
      setServerDown(!ok);
    });
  }, []);

  // Recovery poll while server-down.
  useEffect(() => {
    if (!serverDown) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      if (navigator.onLine === false) return;
      const ok = await probeHealth();
      if (ok && !cancelled) {
        setServerDown(false);
        void queryClient.invalidateQueries();
      }
    }, RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [serverDown, queryClient]);

  // Reflect server-down on <html> so global.css can dim controls (parity with
  // the offline html.is-offline marker).
  useEffect(() => {
    document.documentElement.classList.toggle("is-server-down", serverDown);
    return () => document.documentElement.classList.remove("is-server-down");
  }, [serverDown]);

  const status: ConnectivityStatus = !networkOnline
    ? "offline"
    : serverDown
      ? "server-down"
      : "online";

  return (
    <ConnectivityContext.Provider
      value={{ status, degraded: status !== "online", reason: status }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
}

/**
 * ServerDownSeed — mounted by (app)/layout ONLY on a cold reload where the
 * server already knows the API is down. Pushes one "unreachable" report so the
 * provider confirms + shows the banner immediately (instead of waiting for the
 * first client query to fail).
 */
export function ServerDownSeed() {
  useEffect(() => {
    // Lazy import keeps this leaf tiny + avoids SSR evaluation of the bus.
    void import("@/lib/api-unreachable-bus").then((m) =>
      m.reportApiUnreachable(),
    );
  }, []);
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test test/components/connectivity-provider.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/connectivity-provider.tsx apps/web/test/components/connectivity-provider.test.tsx
git commit -m "feat(connectivity): ConnectivityProvider with health-probe + recovery"
```

---

## Task 4: Mount `ConnectivityProvider` inside the QueryClient

**Files:**

- Modify: `apps/web/src/components/providers/query-provider.tsx`

- [ ] **Step 1: Modify the provider to nest ConnectivityProvider**

In `query-provider.tsx`, import the provider and wrap `children`:

```tsx
import { ConnectivityProvider } from "@/components/common/connectivity-provider";
```

Change the final return from:

```tsx
return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
```

to:

```tsx
return (
  <QueryClientProvider client={client}>
    <ConnectivityProvider>{children}</ConnectivityProvider>
  </QueryClientProvider>
);
```

- [ ] **Step 2: Verify the app build typechecks**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/providers/query-provider.tsx
git commit -m "feat(connectivity): mount ConnectivityProvider inside QueryClient"
```

---

## Task 5: `OfflineStaleBar` consumes the provider + server-down wording

**Files:**

- Modify: `apps/web/src/components/common/offline-stale-bar.tsx`
- Test: `apps/web/test/components/offline-stale-bar-serverdown.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/components/offline-stale-bar-serverdown.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineStaleBar } from "../../src/components/common/offline-stale-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key} ${Object.values(vals).join(" ")}` : key,
  useFormatter: () => ({ relativeTime: () => "5 minutes ago" }),
}));
vi.mock("../../src/hooks/use-cache-age", () => ({
  useCacheAge: () => ({ kind: "unknown" }),
}));

let mockStatus: "online" | "offline" | "server-down" = "server-down";
vi.mock("../../src/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: mockStatus,
    degraded: mockStatus !== "online",
    reason: mockStatus,
  }),
}));

describe("OfflineStaleBar — server-down", () => {
  it("renders the server-down banner copy when status is server-down", () => {
    mockStatus = "server-down";
    render(<OfflineStaleBar budgetId={null} />);
    // echoed key from the mocked useTranslations (root namespace)
    expect(screen.getByTestId("offline-stale-bar").textContent).toContain(
      "serverDown.banner.unknown",
    );
  });

  it("renders the offline banner copy when status is offline", () => {
    mockStatus = "offline";
    render(<OfflineStaleBar budgetId={null} />);
    expect(screen.getByTestId("offline-stale-bar").textContent).toContain(
      "offline.staleBar.unknown",
    );
  });

  it("renders nothing when online", () => {
    mockStatus = "online";
    const { container } = render(<OfflineStaleBar budgetId={null} />);
    expect(
      container.querySelector('[data-testid="offline-stale-bar"]'),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test test/components/offline-stale-bar-serverdown.test.tsx`
Expected: FAIL — bar still reads `navigator.onLine`, uses `offline` namespace only.

- [ ] **Step 3: Modify `offline-stale-bar.tsx`**

Replace the local online state with the provider, switch to root translations, and branch the message. Apply these edits:

1. Change the `next-intl` import + add the hook import:

```tsx
import { useTranslations, useFormatter } from "next-intl";
import { useConnectivity } from "@/components/common/connectivity-provider";
```

2. In `OfflineStaleBar`, replace the `const t = useTranslations("offline");` and the `const [isOnline, setIsOnline] = useState(true);` + the `useIsoLayoutEffect` online listener block with:

```tsx
const t = useTranslations();
const { status } = useConnectivity();
const isOnline = status === "online";
```

Delete the `useIsoLayoutEffect`/`useState(true)` connectivity block and the now-unused `useLayoutEffect`/`useIsoLayoutEffect` definitions (keep `useEffect`, `useState` for `now`, `useMemo`).

3. Replace the message-building block with a namespace prefix chosen by status:

```tsx
if (isOnline) return null;

const ns = status === "server-down" ? "serverDown.banner" : "offline.staleBar";

const syncedPhrase =
  age.kind === "synced"
    ? now.getTime() - age.at.getTime() < 60_000
      ? t("offline.staleBar.lessThanMinute")
      : fmt.relativeTime(age.at, now)
    : "";

const message =
  age.kind === "synced"
    ? t(`${ns}.message`, { relativeTime: syncedPhrase })
    : age.kind === "never"
      ? t(`${ns}.never`)
      : t(`${ns}.unknown`);
```

4. The tick `useEffect` guard `if (isOnline || age.kind !== "synced") return;` stays valid (isOnline now derived from status). Leave it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test test/components/offline-stale-bar-serverdown.test.tsx test/components/offline-stale-bar.test.tsx`
Expected: PASS (new 3 + existing bar tests). If the existing `offline-stale-bar.test.tsx` mocked `navigator.onLine`, update it to mock `useConnectivity` the same way (status `offline`/`online`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/offline-stale-bar.tsx apps/web/test/components/offline-stale-bar-serverdown.test.tsx apps/web/test/components/offline-stale-bar.test.tsx
git commit -m "feat(connectivity): OfflineStaleBar shows server-down banner via provider"
```

---

## Task 6: `OfflineReadOnly` blocks when degraded (offline OR server-down)

**Files:**

- Modify: `apps/web/src/components/common/offline-read-only.tsx`
- Test: `apps/web/test/components/offline-read-only-serverdown.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/components/offline-read-only-serverdown.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { OfflineReadOnly } from "../../src/components/common/offline-read-only";

const toastFn = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toastFn(...a) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
let mockStatus: "online" | "offline" | "server-down" = "server-down";
vi.mock("../../src/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: mockStatus,
    degraded: mockStatus !== "online",
    reason: mockStatus,
  }),
}));

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

beforeEach(() => {
  toastFn.mockReset();
  setOnline(true); // network is up; only server is down
});

describe("OfflineReadOnly — server-down", () => {
  it("blocks a write control + toasts the server-down message when server-down", () => {
    mockStatus = "server-down";
    render(<OfflineReadOnly />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const evt = new Event("pointerdown", { bubbles: true, cancelable: true });
    const notPrevented = input.dispatchEvent(evt);
    expect(notPrevented).toBe(false); // preventDefault was called
    expect(toastFn).toHaveBeenCalledWith(
      "serverDown.banner.readOnly",
      expect.objectContaining({ position: "bottom-center" }),
    );
    document.body.removeChild(input);
  });

  it("does NOT block when online", () => {
    mockStatus = "online";
    render(<OfflineReadOnly />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const notPrevented = input.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(notPrevented).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test test/components/offline-read-only-serverdown.test.tsx`
Expected: FAIL — current code only blocks on `navigator.onLine === false`.

- [ ] **Step 3: Modify `offline-read-only.tsx`**

Replace the component so it reads the provider via a ref (so the capture handler sees the latest status without re-subscribing) and toasts per reason:

```tsx
"use client";
// ...keep the file doc comment...
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { shouldBlockOfflineInteraction } from "@/lib/offline-readonly";
import { useConnectivity } from "@/components/common/connectivity-provider";

export function OfflineReadOnly() {
  const t = useTranslations();
  const { degraded, reason } = useConnectivity();
  const stateRef = useRef({ degraded, reason });
  stateRef.current = { degraded, reason };

  useEffect(() => {
    let lastToast = 0;

    function block(e: Event) {
      if (!stateRef.current.degraded) return;
      const target = e.target as Element | null;
      if (!shouldBlockOfflineInteraction(target)) return;
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - lastToast > 1500) {
        lastToast = now;
        const msg =
          stateRef.current.reason === "server-down"
            ? t("serverDown.banner.readOnly")
            : t("offline.readOnly");
        toast(msg, { position: "bottom-center" });
      }
    }

    const capture = true;
    const types: (keyof DocumentEventMap)[] = [
      "pointerdown",
      "mousedown",
      "click",
      "beforeinput",
      "change",
      "submit",
    ];
    for (const ty of types) document.addEventListener(ty, block, capture);
    return () => {
      for (const ty of types) document.removeEventListener(ty, block, capture);
    };
  }, [t]);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test test/components/offline-read-only-serverdown.test.tsx`
Expected: PASS (2 tests). Also re-run any existing offline-read-only test; if it mocked `navigator.onLine` only, add the `useConnectivity` mock with status `offline`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/offline-read-only.tsx apps/web/test/components/offline-read-only-serverdown.test.tsx
git commit -m "feat(connectivity): OfflineReadOnly blocks writes on server-down too"
```

---

## Task 7: `(app)/layout` renders the degraded shell on `ServerUnavailableError`

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/layout.tsx`

**Note:** This RSC layout can't be unit-tested under Vitest (it pulls `next/headers`); it is covered by the live verification in Task 9. Implement carefully against the spec.

- [ ] **Step 1: Add the cookie helper + degraded branch**

In the `serverDown` handling block (currently lines ~82-99), replace the unconditional redirect with a cookie check. Replace:

```tsx
if (serverDown) {
  const hdrs = await headers();
  const intendedPath =
    hdrs.get("x-middleware-request-x-pathname") ?? hdrs.get("x-pathname");
  const params = new URLSearchParams();
  if (intendedPath && !intendedPath.endsWith("/server-down")) {
    params.set("next", intendedPath);
  }
  const qs = params.toString();
  redirect(`/${locale}/server-down${qs ? `?${qs}` : ""}`);
}
```

with:

```tsx
// Server-down (API unreachable). NEW: if the user has a session cookie, render
// the cached shell in DEGRADED mode (ConnectivityProvider shows the red
// "server unavailable — showing cached data" banner + read-only) instead of
// bouncing to the /server-down card. We can't verify the session (API is
// down) — we trust cookie presence (edge middleware already checks it) + RLS,
// exactly as offline does. No cookie → keep the /server-down redirect.
let degradedServerDown = false;
if (serverDown) {
  const cookieStore = await cookies();
  const hasSessionCookie =
    !!cookieStore.get("__Secure-better-auth.session_token")?.value ||
    !!cookieStore.get("better-auth.session_token")?.value;
  if (hasSessionCookie) {
    degradedServerDown = true;
  } else {
    const hdrs = await headers();
    const intendedPath =
      hdrs.get("x-middleware-request-x-pathname") ?? hdrs.get("x-pathname");
    const params = new URLSearchParams();
    if (intendedPath && !intendedPath.endsWith("/server-down")) {
      params.set("next", intendedPath);
    }
    const qs = params.toString();
    redirect(`/${locale}/server-down${qs ? `?${qs}` : ""}`);
  }
}
```

- [ ] **Step 2: Guard the session-dependent code for the degraded path**

The `if (!session)` redirect (lines ~100-108) and the onboarding guard (lines ~123-164) both assume a verified session. Wrap them so they only run when NOT degraded. Change `if (!session) {` to:

```tsx
  if (!degradedServerDown && !session) {
```

and change the onboarding guard condition `if (pathname && !pathname.includes("/budgets/new")) {` to:

```tsx
  if (!degradedServerDown && pathname && !pathname.includes("/budgets/new")) {
```

- [ ] **Step 3: Make the locale + activeBudgetId derivation degraded-safe**

`activeBudgetId` already derives from the header (no session needed) — keep it. For `LocaleCookieSync`, replace `accountLocale={session.user.locale ?? "en"}` with a degraded-safe value. Just above the `return (`:

```tsx
const cookieStore2 = await cookies();
const accountLocale =
  session?.user.locale ?? cookieStore2.get("budget-locale")?.value ?? "en";
```

and in the JSX change `<LocaleCookieSync accountLocale={session.user.locale ?? "en"} />` to `<LocaleCookieSync accountLocale={accountLocale} />`.

- [ ] **Step 4: Seed the banner + reserve the bar slot on cold reload**

Import the seed at the top:

```tsx
import { ServerDownSeed } from "@/components/common/connectivity-provider";
```

Add `is-server-down` to the shell root when degraded so `global.css` can reserve the bar slot + dim pre-paint, and mount the seed. Change the shell root `<div data-shell-root className="flex h-lvh flex-col ...">` to include the class conditionally:

```tsx
      <div
        data-shell-root
        className={`flex h-lvh flex-col bg-[var(--canvas-dark)] text-[var(--body-on-dark)]${degradedServerDown ? " is-server-down" : ""}`}
      >
```

and immediately after `<OfflineReadOnly />` add:

```tsx
{
  degradedServerDown && <ServerDownSeed />;
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no errors. (`session` is now possibly-undefined on the degraded path — the guards in Steps 2-3 use optional chaining, so any remaining `session.user` access must be behind `!degradedServerDown`. If tsc flags a `session` access, it is on a non-degraded path and can stay as `session!`-safe because that branch only runs when `session` is set; prefer `session?.` where the type complains.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/(app)/layout.tsx
git commit -m "feat(connectivity): render cached degraded shell on server-down (cookie present)"
```

---

## Task 8: i18n `serverDown.banner.*` keys + dim CSS

**Files:**

- Modify: `apps/web/messages/en.json`, `apps/web/messages/pl.json`, `apps/web/messages/uk.json`
- Modify: `apps/web/src/app/global.css`

- [ ] **Step 1: Add the `banner` block under `serverDown` in en.json**

Inside the existing `"serverDown": { ... }` object, add a `"banner"` key:

```json
"banner": {
  "message": "Server unavailable — data updated {relativeTime}",
  "never": "Server unavailable — data not cached",
  "unknown": "Server unavailable — showing cached data",
  "readOnly": "Budget is read-only while the server is unavailable."
}
```

- [ ] **Step 2: Add the same block to pl.json**

```json
"banner": {
  "message": "Serwer niedostępny — dane zaktualizowano {relativeTime}",
  "never": "Serwer niedostępny — brak danych w pamięci podręcznej",
  "unknown": "Serwer niedostępny — wyświetlanie danych z pamięci podręcznej",
  "readOnly": "Budżet jest tylko do odczytu, gdy serwer jest niedostępny."
}
```

- [ ] **Step 3: Add the same block to uk.json**

```json
"banner": {
  "message": "Сервер недоступний — дані оновлено {relativeTime}",
  "never": "Сервер недоступний — дані не кешовано",
  "unknown": "Сервер недоступний — показано кешовані дані",
  "readOnly": "Бюджет доступний лише для перегляду, поки сервер недоступний."
}
```

- [ ] **Step 4: Run the i18n parity test**

Run: `cd apps/web && bun run test test/i18n`
Expected: PASS (parity holds — the new keys exist in all three locales).

- [ ] **Step 5: Mirror the offline dim + bar-slot CSS for `is-server-down`**

Find the existing offline rules:

Run: `grep -n "is-offline" apps/web/src/app/global.css`

For EACH selector that uses `html.is-offline` for (a) the `[data-offline-bar-slot]` height reservation and (b) the read-only control dimming, add a parallel selector with `.is-server-down` (the class the layout puts on `data-shell-root` and the provider toggles on `<html>`). Example transform — if the file has:

```css
html.is-offline [data-offline-bar-slot] {
  min-height: 1.5rem;
}
```

make it:

```css
html.is-offline [data-offline-bar-slot],
.is-server-down [data-offline-bar-slot] {
  min-height: 1.5rem;
}
```

Apply the same dual-selector addition to every `html.is-offline` dim rule (the ones that reduce opacity / disable pointer events on write controls). Keep the offline selector intact; only ADD the `.is-server-down` variant.

- [ ] **Step 6: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/pl.json apps/web/messages/uk.json apps/web/src/app/global.css
git commit -m "feat(connectivity): server-down banner i18n (en/pl/uk) + dim CSS"
```

---

## Task 9: Live verification (controlled API stop) + full suite

**Files:** none (verification only).

- [ ] **Step 1: Build + restart web**

```bash
cd /home/claude/budget && docker compose build web && make restart-web
```

Wait for `docker compose ps` to show `web` healthy.

- [ ] **Step 2: Full web Vitest + tsc green**

Run: `cd apps/web && bunx tsc --noEmit && bun run test`
Expected: 0 failures (new tests pass, no regressions).

- [ ] **Step 3: Live cold-reload server-down (Playwright/manual)**

```bash
cd /home/claude/budget && docker compose stop api
```

- Sign in (or already signed-in) at https://budget-dev.madonzy.com, open a budget tab, then RELOAD.
- Expected: NO `/server-down` card. The cached budget renders with the **red banner "Server unavailable — showing cached data"**; tapping any input/toggle/save shows the read-only toast; navigation between tabs still works.

- [ ] **Step 4: Live recovery**

```bash
cd /home/claude/budget && infisical run --env=dev -- docker compose --env-file .env --env-file .env.local up -d api
```

- Within ~7s the banner clears and data refetches (no manual reload needed).

- [ ] **Step 5: Confirm offline still works (regression)**

In the browser devtools set offline → the banner shows the OFFLINE copy ("Offline — …"), read-only still blocks. Set online → clears.

- [ ] **Step 6: Commit (if any verification-driven fixes were needed)**

```bash
git add -A && git commit -m "test(connectivity): live-verify server-down cached banner + recovery"
```

---

## Task 10: Update UAT Test 12 + memory

**Files:**

- Modify: `.planning/phases/08-pwa-offline-push-i18n-e2e-hardening/08-UAT.md`
- Create/Modify: memory under `/home/claude/.claude/projects/-home-claude-budget/memory/`

- [ ] **Step 1: Rewrite Test 12 expectation** to: "API down + signed-in → cached app with red 'Server unavailable — showing cached data' banner + read-only (NOT the /server-down card); recovers automatically when the API returns. The /server-down card remains only for the no-session-cookie case." Record `claude_verified` with the live results.

- [ ] **Step 2: Write a project memory** `project_server_down_cached_banner.md` capturing: ConnectivityProvider is the single source of truth (online/offline/server-down); server-down enters only after a /api/health probe; layout renders the cached shell on ServerUnavailableError when a session cookie is present (trust cookie+RLS like offline); recovery polls /api/health + invalidateQueries. Add the one-line pointer to `MEMORY.md`.

- [ ] **Step 3: Commit**

```bash
git add .planning/phases/08-pwa-offline-push-i18n-e2e-hardening/08-UAT.md
git commit -m "docs(uat): Test 12 now expects server-down cached banner"
```

---

## Self-Review

- **Spec coverage:** ConnectivityProvider (T3), detection via bus+clientApiFetch (T1,T2), health-probe confirm + recovery (T3), layout degraded render with cookie trust (T7), OfflineStaleBar wording (T5), OfflineReadOnly degraded (T6), i18n (T8), OfflineNavGuard untouched (by omission — explicit in spec), live tests (T9). All spec sections mapped.
- **Type consistency:** `ConnectivityStatus`/`useConnectivity()`/`degraded`/`reason` used identically across T3/T5/T6; `reportApiUnreachable`/`reportApiOk`/`subscribeApiReachability` consistent across T1/T2/T3; `ServerDownSeed` defined T3, used T7.
- **Placeholders:** none — every code step shows full code; the only grep-and-adapt step (T8.5) gives the exact transform with an example because the offline CSS selectors must be matched in-place.
- **Out of scope** honored: no nav-guard change, no logged-out path change, no write-queue.
