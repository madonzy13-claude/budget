/**
 * The assertion `make restore-check` cannot make from inside its container:
 * that a restored backup plus BUDGET_KEK yields a database people can still
 * log in to.
 *
 * `identity.users.email_hash` is BLAKE2b keyed by the KEK (see
 * LibsodiumKeyStore.emailHash) and is how a sign-in finds its user. Row counts
 * prove the bytes came back; only recomputing a hash and matching it proves the
 * KEK in hand is the KEK those bytes were written with. Get that wrong and
 * every restore looks perfect while nobody can sign in.
 *
 * Usage: bun scripts/verify-restored-kek.ts <database>
 */
import { Pool } from "pg";
import { LibsodiumKeyStore } from "@budget/platform";

const database = process.argv[2];
if (!database) {
  console.error("usage: bun scripts/verify-restored-kek.ts <database>");
  process.exit(2);
}
// Guard: this script is read-only, but point it at a scratch restore, never at
// the live database it was restored from.
if (!database.startsWith("restore_check_")) {
  console.error(`refusing to run against "${database}" — expected restore_check_*`);
  process.exit(2);
}

const pool = new Pool({
  host: process.env["PGHOST"] ?? "127.0.0.1",
  port: Number(process.env["PGPORT"] ?? 5432),
  user: process.env["PGUSER"] ?? "postgres",
  password: process.env["PGPASSWORD"] ?? process.env["POSTGRES_PASSWORD"],
  database,
});

const keyStore = new LibsodiumKeyStore();
let checked = 0;
let matched = 0;

try {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    email_hash: Buffer;
  }>(
    `SELECT id, email, email_hash
       FROM identity.users
      WHERE email_hash IS NOT NULL AND email IS NOT NULL
      LIMIT 25`,
  );

  if (rows.length === 0) {
    console.error("FAIL: no rows with an email_hash — nothing to verify");
    process.exit(1);
  }

  for (const row of rows) {
    checked++;
    const expected = Buffer.from(await keyStore.emailHash(row.email));
    if (expected.equals(row.email_hash)) matched++;
    else console.error(`  MISMATCH for user ${row.id}`);
  }

  console.log(`[kek-check] ${matched}/${checked} email hashes recomputed correctly`);

  // Wrapped DEKs: nothing decrypts data with these today (email_encrypted is
  // unpopulated), but they must still unwrap, or the envelope is already broken
  // before anything starts relying on it.
  const { rows: keys } = await pool.query<{
    user_id: string;
    cipher_dek: Buffer;
    nonce: Buffer;
  }>(
    `SELECT user_id, cipher_dek, nonce
       FROM shared_kernel.user_keys
      WHERE destroyed_at IS NULL
      LIMIT 10`,
  );
  let unwrapped = 0;
  for (const k of keys) {
    try {
      await keyStore.unwrapUserDek({
        cipherDek: new Uint8Array(k.cipher_dek),
        nonce: new Uint8Array(k.nonce),
      });
      unwrapped++;
    } catch {
      console.error(`  DEK unwrap FAILED for user ${k.user_id}`);
    }
  }
  console.log(`[kek-check] ${unwrapped}/${keys.length} user DEKs unwrapped`);

  if (matched !== checked || unwrapped !== keys.length) {
    console.error("FAIL: BUDGET_KEK does not match the data in this backup");
    process.exit(1);
  }
  console.log("[kek-check] PASS — this backup + this BUDGET_KEK is a working system");
} finally {
  await pool.end();
}
