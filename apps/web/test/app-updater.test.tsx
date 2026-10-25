/**
 * app-updater.test.tsx — the app keeps itself on the latest build (user, 261023).
 *
 * It asks /version.json which build the server runs. A stale app reloads
 * itself when nobody is using it — straight away on open, otherwise after a
 * quiet minute — never mid-form or mid-save. If a plain reload brought the old
 * build back, the next attempt is a clean reload (no service worker, no cached
 * files), and after that it stops, so it can never loop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m) } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, string>) =>
    v ? `${k} ${Object.values(v).join(" ")}` : k,
}));

import { AppUpdater } from "../src/components/common/app-updater";
import { RUNNING_BUILD, QUIET_MS, setLatestBuild } from "../src/lib/app-update";

let reload: ReturnType<typeof vi.fn>;
let unregister: ReturnType<typeof vi.fn>;
let deleted: string[];

function serverRuns(buildId: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId, version: "9.9.9" }),
    }),
  );
}

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppUpdater />
    </QueryClientProvider>,
  );
}

/** Let the version fetch settle. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
  localStorage.clear();
  sessionStorage.clear();
  setLatestBuild(null);
  toastSuccess.mockClear();
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, pathname: "/en/budgets/b1/wallets", reload },
    configurable: true,
    writable: true,
  });
  unregister = vi.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      ready: Promise.resolve({ update: vi.fn().mockResolvedValue(undefined) }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
  deleted = [];
  vi.stubGlobal("caches", {
    keys: vi.fn().mockResolvedValue(["nav-docs-v1", "scripts", "budget-deeplink"]),
    delete: vi.fn(async (k: string) => {
      deleted.push(k);
      return true;
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("AppUpdater", () => {
  it("leaves an up-to-date app alone", async () => {
    serverRuns(RUNNING_BUILD);
    mount();
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(QUIET_MS * 2));
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a stale app straight away when nobody has touched it yet", async () => {
    serverRuns("newer");
    mount();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
  });

  it("waits for a quiet minute when someone is already using it", async () => {
    serverRuns("newer");
    mount();
    fireEvent.pointerDown(document.body);
    await settle();
    expect(reload).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(QUIET_MS + 10_000));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads while a field has focus", async () => {
    serverRuns("newer");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    mount();
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(QUIET_MS * 3));
    expect(reload).not.toHaveBeenCalled();
  });

  it("goes for a clean reload when the plain one brought the old build back", async () => {
    localStorage.setItem(
      "app-update-attempt",
      JSON.stringify({ target: "newer", step: "reload" }),
    );
    serverRuns("newer");
    mount();
    await settle();
    expect(unregister).toHaveBeenCalled();
    expect(deleted).toEqual(["nav-docs-v1", "scripts"]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops after the clean reload so it can never loop", async () => {
    localStorage.setItem(
      "app-update-attempt",
      JSON.stringify({ target: "newer", step: "clean" }),
    );
    serverRuns("newer");
    mount();
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(QUIET_MS * 3));
    expect(reload).not.toHaveBeenCalled();
  });

  // user, 261023: say so when the update has landed — the save banner, auto-hiding.
  it("announces the newest version once the update has landed", async () => {
    localStorage.setItem(
      "app-update-attempt",
      JSON.stringify({ target: RUNNING_BUILD, step: "reload" }),
    );
    serverRuns(RUNNING_BUILD);
    mount();
    await settle();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess.mock.calls[0][0]).toContain("version.updated");
    expect(localStorage.getItem("app-update-attempt")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("brings the person back to where they were scrolled", async () => {
    const main = document.createElement("main");
    main.setAttribute("data-shell-scroll", "");
    Object.defineProperty(main, "scrollHeight", { value: 5000 });
    Object.defineProperty(main, "clientHeight", { value: 600 });
    document.body.appendChild(main);
    main.scrollTop = 900;
    serverRuns("newer");
    mount();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);

    // …the reloaded page mounts again on the same path.
    main.scrollTop = 0;
    serverRuns(RUNNING_BUILD);
    mount();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(main.scrollTop).toBe(900);
  });
});
