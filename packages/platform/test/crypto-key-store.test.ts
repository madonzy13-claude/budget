import { test, expect } from "bun:test";
import { LibsodiumKeyStore } from "../src/crypto/libsodium-key-store";
import { UserId } from "@budget/shared-kernel";

// 44-char base64 = 32 bytes. Last 4-char group must end with char whose last 2 bits are 0
// (required by standard base64 padding rules). A=0 (bits 000000 ✓), B=1 (bits 000001 ✗).
// KEK_A: 43 A's + '=' — all zero bytes, valid last group AAA=
// KEK_B: B + 42 A's + '=' — different first byte, still valid last group AAA=
const KEK_A = "A".repeat(43) + "=";
const KEK_B = "B" + "A".repeat(42) + "=";

test("LibsodiumKeyStore round-trips DEK", async () => {
  const ks = new LibsodiumKeyStore(KEK_A);
  const wrapped = await ks.generateUserDek(UserId("u1"));
  const dek = await ks.unwrapUserDek(wrapped);
  expect(dek.length).toBe(32);
});

test("LibsodiumKeyStore encryptForUser / decryptForUser round-trip", async () => {
  const ks = new LibsodiumKeyStore(KEK_A);
  const wrapped = await ks.generateUserDek(UserId("u1"));
  const dek = await ks.unwrapUserDek(wrapped);
  const enc = await ks.encryptForUser(dek, "hello@user.com");
  const dec = await ks.decryptForUser(dek, enc);
  expect(dec).toBe("hello@user.com");
});

test("LibsodiumKeyStore unwrap fails with wrong KEK", async () => {
  const ksA = new LibsodiumKeyStore(KEK_A);
  const ksB = new LibsodiumKeyStore(KEK_B);
  const wrapped = await ksA.generateUserDek(UserId("u1"));
  await expect(ksB.unwrapUserDek(wrapped)).rejects.toThrow();
});

import { dekContext } from "../src/crypto/dek-context";

test("dekContext.get returns undefined outside run scope", () => {
  expect(dekContext.get()).toBeUndefined();
});

test("dekContext.run scopes the DEK", async () => {
  const dek = new Uint8Array([1, 2, 3]);
  const inside = await dekContext.run(dek, async () => dekContext.get());
  expect(inside).toEqual(dek);
});

test("dekContext two concurrent runs are isolated", async () => {
  const a = new Uint8Array([1]);
  const b = new Uint8Array([2]);
  const [ra, rb] = await Promise.all([
    dekContext.run(a, async () => dekContext.get()),
    dekContext.run(b, async () => dekContext.get()),
  ]);
  expect(ra).toEqual(a);
  expect(rb).toEqual(b);
});
