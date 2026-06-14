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
}

function installFakeServiceWorker(controller: object | null): FakeSW {
  const listeners: Record<string, SwListener[]> = {};
  const sw: FakeSW = {
    controller,
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
