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
  return () => {
    listeners.delete(listener);
  };
}
