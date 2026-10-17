/**
 * password-rules.ts — one place for the password length, because it was in
 * three and they disagreed (user, 261014).
 *
 * better-auth is configured `minPasswordLength: 10`
 * (packages/identity/src/adapters/persistence/better-auth.ts). The sign-up
 * form checked 8, so a 9-character password passed the form and was refused by
 * the server — which answered in better-auth's own English, quoting ITS
 * default of 8 and knowing nothing of the configured 10. A message that was
 * both untranslated and wrong.
 *
 * Anything that asks for a password imports this, and the copy interpolates it
 * rather than spelling a number out, so the two cannot drift apart again.
 */
export const MIN_PASSWORD_LENGTH = 10;
