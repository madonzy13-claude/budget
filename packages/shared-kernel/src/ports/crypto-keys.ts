import type { UserId } from '../ids';

export interface CryptoKeyStore {
  generateUserDek(userId: UserId): Promise<{ cipherDek: Uint8Array; nonce: Uint8Array }>;
  unwrapUserDek(record: { cipherDek: Uint8Array; nonce: Uint8Array }): Promise<Uint8Array>;
  encryptForUser(
    dek: Uint8Array,
    plaintext: string
  ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }>;
  decryptForUser(
    dek: Uint8Array,
    record: { ciphertext: Uint8Array; nonce: Uint8Array }
  ): Promise<string>;
  emailHash(email: string): Promise<Uint8Array>;
}

/**
 * InMemoryCryptoKeyStore — identity functions only, NO real crypto.
 * Plan 4 ships the libsodium adapter.
 */
export class InMemoryCryptoKeyStore implements CryptoKeyStore {
  async generateUserDek(_userId: UserId): Promise<{ cipherDek: Uint8Array; nonce: Uint8Array }> {
    return {
      cipherDek: new TextEncoder().encode('dek'),
      nonce: new Uint8Array(24),
    };
  }

  async unwrapUserDek(_record: {
    cipherDek: Uint8Array;
    nonce: Uint8Array;
  }): Promise<Uint8Array> {
    return new TextEncoder().encode('dek');
  }

  async encryptForUser(
    _dek: Uint8Array,
    plaintext: string
  ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    return {
      ciphertext: new TextEncoder().encode(plaintext),
      nonce: new Uint8Array(24),
    };
  }

  async decryptForUser(
    _dek: Uint8Array,
    record: { ciphertext: Uint8Array; nonce: Uint8Array }
  ): Promise<string> {
    return new TextDecoder().decode(record.ciphertext);
  }

  async emailHash(email: string): Promise<Uint8Array> {
    return new TextEncoder().encode(email.toLowerCase());
  }
}
