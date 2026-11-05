import { fromMinorUnits } from "../money";
import { untrusted } from "./define";

/**
 * present.ts — the one presentation pass every read tool's route payload goes
 * through before the agent sees it:
 *  - `*_cents` / `*Cents` integers → decimal strings under the key minus the
 *    suffix, in the closest sibling currency (never a float),
 *  - user-authored text → { untrusted_user_text } (D-20, Pitfall 9),
 *  - never "draft": the user calls those unconfirmed scheduled payments.
 */
const USER_TEXT_KEYS = new Set([
  "note",
  "name",
  "title",
  "description",
  "label",
  "memo",
  "payee",
]);
const ENUM_KEYS = new Set(["status", "kind"]);
const CENTS_RE = /(_cents|Cents)$/;

const tokens = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split("_")
    .filter(Boolean);

/** The sibling currency key sharing the most name tokens with `key`. */
function currencyFor(
  key: string,
  obj: Record<string, unknown>,
  fallback: string,
): string {
  const want = new Set(tokens(key.replace(CENTS_RE, "")));
  let best: string | undefined;
  let bestScore = -1;
  for (const [k, v] of Object.entries(obj)) {
    if (!/currency/i.test(k) || typeof v !== "string") continue;
    const score = tokens(k).filter((t) => t !== "currency" && want.has(t)).length;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best ?? fallback;
}

const noDraft = (s: string) =>
  s.replace(/draft/gi, (m) =>
    m === m.toUpperCase() ? "UNCONFIRMED" : "unconfirmed",
  );
const noDraftKey = (k: string) =>
  k.replace(/draft/gi, (m) => (m[0] === "D" ? "Payment" : "payment"));

export function present(
  value: unknown,
  opts: { fallbackCurrency: string },
): unknown {
  if (Array.isArray(value)) return value.map((v) => present(v, opts));
  if (value === null || typeof value !== "object" || value instanceof Date)
    return value;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) {
    if (CENTS_RE.test(key) && (typeof v === "number" || typeof v === "string" || typeof v === "bigint" || v === null)) {
      out[noDraftKey(key.replace(CENTS_RE, ""))] =
        v === null
          ? null
          : fromMinorUnits(String(v), currencyFor(key, obj, opts.fallbackCurrency));
    } else if (USER_TEXT_KEYS.has(key) && typeof v === "string") {
      out[key] = untrusted(v);
    } else if (ENUM_KEYS.has(key) && typeof v === "string") {
      out[key] = noDraft(v);
    } else {
      out[noDraftKey(key)] = present(v, opts);
    }
  }
  return out;
}
