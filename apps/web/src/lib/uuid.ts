/**
 * uuid.ts — UUID v4 generator with HTTP-context fallback.
 *
 * `crypto.randomUUID()` requires a Secure Context (HTTPS or localhost). When the
 * app is served over plain HTTP (e.g. the Tailscale dev URL used by E2E tests),
 * `crypto.randomUUID` is undefined and calling it throws.
 *
 * This helper falls back to a Math.random-based v4 implementation in those cases.
 * Sufficient for client-generated Idempotency-Key values where collision risk is
 * already bounded by user × form session.
 */
export function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = parseInt(c, 10);
    return (n ^ (Math.floor(Math.random() * 16) >> (n / 4))).toString(16);
  });
}
