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
// "unsupported" without this flag).

const INSTALLED_KEY = "pwa-installed";

type InstalledListener = (installed: boolean) => void;

let _installed: boolean | null = null;
const _installedListeners = new Set<InstalledListener>();

function readInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function isInstalled(): boolean {
  if (_installed === null) _installed = readInstalled();
  return _installed;
}

export function setInstalled(installed: boolean) {
  _installed = installed;
  try {
    if (installed) localStorage.setItem(INSTALLED_KEY, "1");
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // storage unavailable — in-memory state still works for this session
  }
  if (installed && _deferredPrompt) setDeferredPrompt(null);
  _installedListeners.forEach((l) => l(installed));
}

export function subscribeToInstalled(listener: InstalledListener): () => void {
  _installedListeners.add(listener);
  listener(isInstalled());
  return () => _installedListeners.delete(listener);
}
