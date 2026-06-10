// scripts/check-i18n-completeness.ts
// CI gate: all EN keys must be present in PL and UK, and vice-versa.
// Also asserts no flat key starts with `workspaces.` or `accounts.` (I18N-02).
import en from "../apps/web/messages/en.json";
import pl from "../apps/web/messages/pl.json";
import uk from "../apps/web/messages/uk.json";

// _machineTranslated is a D-19 metadata marker — not a real i18n key, skip it.
const METADATA_KEYS = new Set(["_machineTranslated"]);

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (METADATA_KEYS.has(k)) return [];
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? flatKeys(v as Record<string, unknown>, key)
      : [key];
  });
}

const enKeys = new Set(flatKeys(en as Record<string, unknown>));
const plKeys = new Set(flatKeys(pl as Record<string, unknown>));
const ukKeys = new Set(flatKeys(uk as Record<string, unknown>));

const missing = {
  "EN→PL (EN keys missing from PL)": [] as string[],
  "EN→UK (EN keys missing from UK)": [] as string[],
  "PL→EN (PL keys missing from EN — stale)": [] as string[],
  "UK→EN (UK keys missing from EN — stale)": [] as string[],
};

for (const key of enKeys) {
  if (!plKeys.has(key)) missing["EN→PL (EN keys missing from PL)"].push(key);
  if (!ukKeys.has(key)) missing["EN→UK (EN keys missing from UK)"].push(key);
}
for (const key of plKeys) {
  if (!enKeys.has(key))
    missing["PL→EN (PL keys missing from EN — stale)"].push(key);
}
for (const key of ukKeys) {
  if (!enKeys.has(key))
    missing["UK→EN (UK keys missing from EN — stale)"].push(key);
}

// I18N-02: no flat key may start with `workspaces.` or `accounts.`
const staleNamespaceKeys: string[] = [];
for (const key of [...enKeys, ...plKeys, ...ukKeys]) {
  if (key.startsWith("workspaces.") || key.startsWith("accounts.")) {
    staleNamespaceKeys.push(key);
  }
}

let failed = false;

for (const [label, keys] of Object.entries(missing)) {
  if (keys.length > 0) {
    console.error(`\n[FAIL] ${label}:`);
    for (const k of keys) console.error(`  - ${k}`);
    failed = true;
  }
}

if (staleNamespaceKeys.length > 0) {
  console.error("\n[FAIL] Stale namespace keys (workspaces.* or accounts.*):");
  for (const k of staleNamespaceKeys) console.error(`  - ${k}`);
  failed = true;
}

if (failed) {
  console.error("\ni18n completeness gate FAILED.");
  process.exit(1);
}

console.log("I18N_GATE_PASS");
