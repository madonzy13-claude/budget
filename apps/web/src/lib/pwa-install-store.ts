/**
 * pwa-install-store.ts — Singleton store for the deferred beforeinstallprompt event.
 *
 * Shared between InstallBanner and ProfileMenu so both see the same captured prompt.
 * Uses a simple event-emitter pattern (no React context needed for non-React callers).
 */

type DeferredPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = (prompt: DeferredPrompt | null) => void;

let _deferredPrompt: DeferredPrompt | null = null;
const _listeners = new Set<Listener>();

export function setDeferredPrompt(prompt: DeferredPrompt | null) {
  _deferredPrompt = prompt;
  // A real prompt proves the app is NOT installed — undo the heuristic guess
  // AND the persisted flag: uninstalling (Android) keeps site storage, so the
  // old appinstalled flag would otherwise hide every way to reinstall
  // (user, 261023).
  if (prompt && isInstalled()) {
    _sessionInstalled = false;
    _installed = false;
    try {
      localStorage.removeItem(INSTALLED_KEY);
    } catch {
      // storage unavailable — in-memory state still corrects this session
    }
    notifyInstalled();
  }
  _listeners.forEach((l) => l(prompt));
}

export function getDeferredPrompt(): DeferredPrompt | null {
  return _deferredPrompt;
}

export function subscribeToDeferredPrompt(listener: Listener): () => void {
  _listeners.add(listener);
  // Immediately call with current value
  listener(_deferredPrompt);
  return () => _listeners.delete(listener);
}

// ── Installed state ──────────────────────────────────────────────────────────
// Set by the `appinstalled` listener and persisted so a later browser-tab
// session still knows the PWA exists (browsers never refire
// beforeinstallprompt for an installed app, which is indistinguishable from
// "unsupported" without this flag). A captured prompt clears it — see
// setDeferredPrompt.

const INSTALLED_KEY = "pwa-installed";

type InstalledListener = (installed: boolean) => void;

let _installed: boolean | null = null;
// Session-only heuristic guess (install-detect.ts). Never persisted: a wrong
// guess must not outlive the tab, and a captured prompt reverses it.
let _sessionInstalled = false;
const _installedListeners = new Set<InstalledListener>();

function readInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function notifyInstalled() {
  const v = isInstalled();
  _installedListeners.forEach((l) => l(v));
}

export function isInstalled(): boolean {
  if (_installed === null) _installed = readInstalled();
  return _installed || _sessionInstalled;
}

export function setInstalled(installed: boolean) {
  _installed = installed;
  if (!installed) _sessionInstalled = false;
  try {
    if (installed) localStorage.setItem(INSTALLED_KEY, "1");
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // storage unavailable — in-memory state still works for this session
  }
  if (installed && _deferredPrompt) setDeferredPrompt(null);
  notifyInstalled();
}

/** Heuristic installed flag — session-only, see install-detect.ts. */
export function markSessionInstalled(installed: boolean) {
  if (_sessionInstalled === installed) return;
  _sessionInstalled = installed;
  notifyInstalled();
}

export function subscribeToInstalled(listener: InstalledListener): () => void {
  _installedListeners.add(listener);
  listener(isInstalled());
  return () => _installedListeners.delete(listener);
}
