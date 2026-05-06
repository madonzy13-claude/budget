import { createRequire } from "module";

import type { CryptoKeyStore, UserId } from "@budget/shared-kernel";
import { loadEnv } from "@budget/shared-kernel";

// Bun ESM workaround: libsodium-wrappers ESM bundle references ./libsodium.mjs which
// is absent in 0.7.x releases. CJS path (/dist/modules/…) works correctly via require().

const sodium = createRequire(import.meta.url)(
  "libsodium-wrappers",
) as typeof import("libsodium-wrappers");

/** Pitfall 9: await sodium.ready once at boot before any crypto call. */
let _ready = false;
export async function libsodiumReady(): Promise<void> {
  if (!_ready) {
    await sodium.ready;
    _ready = true;
  }
}

export class LibsodiumKeyStore implements CryptoKeyStore {
  constructor(private kekOverride?: string) {}

  private kekBytes(): Uint8Array {
    const kek = this.kekOverride ?? loadEnv().BUDGET_KEK;
    return sodium.from_base64(kek, sodium.base64_variants.ORIGINAL);
  }

  async generateUserDek(
    _userId: UserId,
  ): Promise<{ cipherDek: Uint8Array; nonce: Uint8Array }> {
    await libsodiumReady();
    const dek = sodium.crypto_secretbox_keygen();
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const cipherDek = sodium.crypto_secretbox_easy(dek, nonce, this.kekBytes());
    return { cipherDek, nonce };
  }

  async unwrapUserDek(record: {
    cipherDek: Uint8Array;
    nonce: Uint8Array;
  }): Promise<Uint8Array> {
    await libsodiumReady();
    const dek = sodium.crypto_secretbox_open_easy(
      record.cipherDek,
      record.nonce,
      this.kekBytes(),
    );
    if (!dek)
      throw new Error(
        "DEK unwrap failed — KEK rotated, record corrupted, or DEK destroyed (right-to-delete)",
      );
    return dek;
  }

  async encryptForUser(
    dek: Uint8Array,
    plaintext: string,
  ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    await libsodiumReady();
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(plaintext),
      nonce,
      dek,
    );
    return { ciphertext, nonce };
  }

  async decryptForUser(
    dek: Uint8Array,
    record: { ciphertext: Uint8Array; nonce: Uint8Array },
  ): Promise<string> {
    await libsodiumReady();
    const plaintext = sodium.crypto_secretbox_open_easy(
      record.ciphertext,
      record.nonce,
      dek,
    );
    if (!plaintext)
      throw new Error(
        "Decrypt failed — DEK destroyed (crypto-shred) or record tampered",
      );
    return sodium.to_string(plaintext);
  }

  /** Deterministic lookup hash. Pitfall 11: KEK as BLAKE2b key. */
  async emailHash(email: string): Promise<Uint8Array> {
    await libsodiumReady();
    return sodium.crypto_generichash(
      32,
      sodium.from_string(email.toLowerCase()),
      this.kekBytes(),
    );
  }
}
