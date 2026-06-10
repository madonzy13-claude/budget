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
