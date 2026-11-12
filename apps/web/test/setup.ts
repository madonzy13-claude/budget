import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// The privacy reveal lasts the app session (sessionStorage) — one test's
// reveal must not leak into the next.
afterEach(() => {
  try {
    sessionStorage.clear();
  } catch {}
});
