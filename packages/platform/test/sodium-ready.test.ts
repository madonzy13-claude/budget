import { createRequire } from "module";

import { expect, test } from "bun:test";
import { libsodiumReady } from "../src/crypto/libsodium-key-store";

test("libsodium ready resolves and is idempotent", async () => {
  await libsodiumReady();
  // Second call is a no-op (idempotent)
  await libsodiumReady();
  // Verify sodium is usable after libsodiumReady()
  // Use createRequire to avoid the ESM path that references missing libsodium.mjs
  const sodium = createRequire(import.meta.url)(
    "libsodium-wrappers",
  ) as typeof import("libsodium-wrappers");
  await sodium.ready;
  const k = sodium.crypto_secretbox_keygen();
  expect(k.length).toBe(32);
});
