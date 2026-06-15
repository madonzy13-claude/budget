/**
 * offline-shell.test.ts — regression for the offline-shell.html cached
 * budget-list render (260615-e8s follow-up).
 *
 * offline-shell.html is the static document the SW serves on a nav-cache MISS
 * when offline. Its inline <script> reads the `active-budgets` IndexedDB store
 * and, if present, replaces the "wasn't preloaded" note with the cached budget
 * list. This test executes that REAL inline script (read from the file) against
 * happy-dom + fake-indexeddb so the behaviour can't silently regress.
 *
 * The SW serving the shell on cache-miss is covered by sw-offline.test.ts; the
 * end-to-end "offline reload shows the list" flow is covered by a Playwright
 * route-abort harness (context.route abort intercepts the SW's fetch — unlike
 * context.setOffline, which does not).
 */
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

const HTML = readFileSync(
  resolve(__dirname, "../public/offline-shell.html"),
  "utf8",
);
const BODY_INNER = HTML.match(/<body>([\s\S]*)<\/body>/)![1];
const SCRIPT = HTML.match(/<script>([\s\S]*?)<\/script>/)![1];

function seedActiveBudgets(
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  return new Promise((res, rej) => {
    const open = indexedDB.open("budget-cache", 3);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("active-budgets")) {
        db.createObjectStore("active-budgets", { keyPath: "id" });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("active-budgets", "readwrite");
      rows.forEach((r) => tx.objectStore("active-budgets").put(r));
      tx.oncomplete = () => {
        db.close();
        res();
      };
      tx.onerror = () => rej(tx.error);
    };
    open.onerror = () => rej(open.error);
  });
}

function deleteDb(): Promise<void> {
  return new Promise((res) => {
    const del = indexedDB.deleteDatabase("budget-cache");
    del.onsuccess = () => res();
    del.onerror = () => res();
    del.onblocked = () => res();
  });
}

async function runShell(): Promise<void> {
  document.body.innerHTML = BODY_INNER;
  // Execute the real inline script (IIFE). It reads location/IndexedDB globals,
  // which happy-dom + fake-indexeddb provide.

  (0, eval)(SCRIPT);
}

async function waitFor(
  pred: () => boolean,
  timeoutMs = 1500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return pred();
}

beforeEach(async () => {
  await deleteDb();
  document.body.innerHTML = "";
});

describe("offline-shell cached budget list", () => {
  it("renders the cached budgets as links when active-budgets is populated", async () => {
    await seedActiveBudgets([
      {
        id: "b-1",
        name: "Family Budget",
        kind: "PRIVATE",
        pendingTasksCount: 0,
      },
      {
        id: "b-2",
        name: "Optimistic Tapo",
        kind: "SHARED",
        pendingTasksCount: 1,
      },
    ]);
    await runShell();

    const ok = await waitFor(
      () => !!document.querySelector('[data-testid="offline-shell-budgets"]'),
    );
    expect(ok).toBe(true);

    const cards = document.querySelectorAll(".shell-budget-card");
    expect(cards.length).toBe(2);
    expect(document.body.textContent).toContain("Family Budget");
    expect(document.body.textContent).toContain("Optimistic Tapo");

    const first = cards[0] as HTMLAnchorElement;
    expect(first.getAttribute("href")).toBe("/en/budgets/b-1/wallets");
    // The bare "wasn't preloaded" note is replaced by the list.
    expect(
      document.querySelector('[data-testid="offline-shell-note"]'),
    ).toBeNull();
  });

  it("keeps the 'wasn't preloaded' note when the cache is empty", async () => {
    await seedActiveBudgets([]); // store exists but no rows
    await runShell();
    // Give the async IDB read a chance to run, then assert the note survived.
    await new Promise((r) => setTimeout(r, 100));
    expect(
      document.querySelector('[data-testid="offline-shell-note"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="offline-shell-budgets"]'),
    ).toBeNull();
  });

  it("escapes user-controlled budget names (no HTML injection)", async () => {
    await seedActiveBudgets([
      { id: "b-x", name: '<img src=x onerror="alert(1)">', kind: "PRIVATE" },
    ]);
    await runShell();

    await waitFor(
      () => !!document.querySelector('[data-testid="offline-shell-budgets"]'),
    );
    // No real <img> element was injected — the name is rendered as text.
    expect(document.querySelector("img")).toBeNull();
    const name = document.querySelector(".shell-budget-name");
    expect(name?.textContent).toContain("<img");
  });
});
