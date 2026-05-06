import { test, expect } from "bun:test";
import { LibsodiumKeyStore } from "../src/crypto/libsodium-key-store";

// 44-char base64 = 32 bytes. Last group char before '=' must have last 2 bits = 0.
// A=0 (000000 ✓), B=1 (000001 ✗). Use B + 42 A's + '=' for KEK_B.
const KEK_A = "A".repeat(43) + "=";
const KEK_B = "B" + "A".repeat(42) + "=";

test("emailHash deterministic same KEK", async () => {
  const ks = new LibsodiumKeyStore(KEK_A);
  const h1 = await ks.emailHash("a@b.com");
  const h2 = await ks.emailHash("a@b.com");
  expect(Buffer.from(h1).toString("hex")).toBe(Buffer.from(h2).toString("hex"));
});

test("emailHash case-insensitive", async () => {
  const ks = new LibsodiumKeyStore(KEK_A);
  const h1 = await ks.emailHash("A@B.com");
  const h2 = await ks.emailHash("a@b.com");
  expect(Buffer.from(h1).toString("hex")).toBe(Buffer.from(h2).toString("hex"));
});

test("emailHash differs across KEK rotation (Pitfall 11)", async () => {
  const ksA = new LibsodiumKeyStore(KEK_A);
  const ksB = new LibsodiumKeyStore(KEK_B);
  const hA = await ksA.emailHash("a@b.com");
  const hB = await ksB.emailHash("a@b.com");
  expect(Buffer.from(hA).toString("hex")).not.toBe(
    Buffer.from(hB).toString("hex"),
  );
});
