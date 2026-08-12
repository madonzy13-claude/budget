/**
 * sw-update-reloader.test.tsx — SW-update auto-reload client island (issue 1)
 *
 * The installed PWA must auto-reload ONCE when a NEW deploy's service worker
 * takes control (controllerchange), so deploys reach installed users without a
 * force-close — EXCEPT the very first install (null→SW controller), which must
 * never reload. A sessionStorage guard prevents a reload loop.
 *
 * Hand-rolled controllerchange listener (NOT @serwist/window) — see component
 * header for the rationale. Driven here with a mocked navigator.serviceWorker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// --- Mock navigator.serviceWorker + window.location.reload -----------------

type SwListener = (ev: Event) => void;

interface FakeSW {
  controller: object | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatch: (type: string) => void;
  /** What the component asks for when it wants a fresh-build check. */
  ready: Promise<{ update: ReturnType<typeof vi.fn> }>;
  update: ReturnType<typeof vi.fn>;
}

function installFakeServiceWorker(controller: object | null): FakeSW {
  const listeners: Record<string, SwListener[]> = {};
  const update = vi.fn().mockResolvedValue(undefined);
  const sw: FakeSW = {
    controller,
    update,
    ready: Promise.resolve({ update }),
    addEventListener: vi.fn((type: string, cb: SwListener) => {
      (listeners[type] ??= []).push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: SwListener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb);
    }),
    dispatch: (type: string) => {
      for (const cb of listeners[type] ?? []) cb(new Event(type));
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: sw,
    configurable: true,
    writable: true,
  });
  return sw;
}

function clearServiceWorker() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  reloadSpy = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: reloadSpy },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  clearServiceWorker();
});

// Import AFTER the mocks are wired so module-level guards see them.
import { SwUpdateReloader } from "../src/components/common/sw-update-reloader";

describe("SwUpdateReloader", () => {
  it("Test 1 — UPDATE controllerchange reloads exactly once", () => {
    const sw = installFakeServiceWorker({}); // a prior controller exists = UPDATE
    render(React.createElement(SwUpdateReloader));

    sw.dispatch("controllerchange");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("Test 2 — FIRST install (null controller) does NOT reload", () => {
    const sw = installFakeServiceWorker(null); // no prior controller = install
    render(React.createElement(SwUpdateReloader));

    sw.dispatch("controllerchange");

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("Test 3a — no loop: a second controllerchange after a reload does not reload again", () => {
    const sw = installFakeServiceWorker({});
    render(React.createElement(SwUpdateReloader));

    sw.dispatch("controllerchange");
    sw.dispatch("controllerchange");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("Test 3b — no loop: if the guard flag is already set at mount, never reloads", () => {
    sessionStorage.setItem("sw-reloaded-once", "1");
    const sw = installFakeServiceWorker({});
    render(React.createElement(SwUpdateReloader));

    sw.dispatch("controllerchange");

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("Test 4 — SSR / no serviceWorker: no throw, no reload", () => {
    clearServiceWorker();
    expect(() => render(React.createElement(SwUpdateReloader))).not.toThrow();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("Test 5 — cleanup removes the controllerchange listener on unmount", () => {
    const sw = installFakeServiceWorker({});
    const { unmount } = render(React.createElement(SwUpdateReloader));

    unmount();

    expect(sw.removeEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );
  });
});

/**
 * Reloading on controllerchange only helps once the browser has NOTICED a new
 * build, and an installed PWA that is resumed from the background never looks:
 * no navigation, no fetch of sw.js, no controllerchange. The app sits on the
 * build it was launched with for as long as it stays alive — a fix deployed
 * hours ago is simply invisible (user, 260810, reporting a corrected figure
 * still reading the old way 44 minutes after the deploy).
 *
 * So coming back to the foreground asks the question outright.
 */
describe("SwUpdateReloader — noticing a deploy on resume", () => {
  const setHidden = (hidden: boolean) =>
    Object.defineProperty(document, "visibilityState", {
      value: hidden ? "hidden" : "visible",
      configurable: true,
    });

  const resume = () => {
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("asks the service worker for a new build when the app is resumed", async () => {
    const sw = installFakeServiceWorker({});
    render(React.createElement(SwUpdateReloader));

    resume();
    await sw.ready;
    await Promise.resolve();

    expect(sw.update).toHaveBeenCalled();
  });

  it("does not ask while the app is hidden", async () => {
    const sw = installFakeServiceWorker({});
    render(React.createElement(SwUpdateReloader));

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await sw.ready;
    await Promise.resolve();

    expect(sw.update).not.toHaveBeenCalled();
  });

  it("does not hammer the network when the app flickers in and out", async () => {
    const sw = installFakeServiceWorker({});
    render(React.createElement(SwUpdateReloader));

    resume();
    await sw.ready;
    await Promise.resolve();
    resume();
    resume();
    await sw.ready;
    await Promise.resolve();

    expect(sw.update).toHaveBeenCalledTimes(1);
  });

  it("survives a browser with no service worker at all", () => {
    clearServiceWorker();
    expect(() => {
      render(React.createElement(SwUpdateReloader));
      resume();
    }).not.toThrow();
  });

  it("stops listening for resumes on unmount", () => {
    installFakeServiceWorker({});
    const spy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(React.createElement(SwUpdateReloader));
    unmount();
    expect(spy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    spy.mockRestore();
  });
});
