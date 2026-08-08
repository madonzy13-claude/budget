/**
 * `server-only` is supplied by Next at build time; it does not exist in
 * node_modules, so a Vitest import of any `*.server.ts` module fails to
 * resolve without this stub. It is deliberately empty — the real package's
 * only job is to break a CLIENT bundle that imports it, which `next build`
 * still enforces (Vitest never saw that boundary anyway).
 */
export {};
