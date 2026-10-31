/**
 * ip-country.ts — turn a session's IP into a country flag for the sessions list.
 *
 * flagEmoji() is pure (ISO-3166 alpha-2 → regional-indicator emoji). lookupCountry()
 * is a BEST-EFFORT client lookup against a free, key-less geo endpoint with a short
 * timeout + in-memory cache; it returns null on any failure so the UI degrades to
 * "IP only, no flag". Private/loopback IPs are skipped (no useful geo). This keeps
 * the flag self-contained — no bundled geo DB, no server change.
 */
export function flagEmoji(code?: string | null): string {
  if (!code) return "";
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

const cache = new Map<string, string | null>();

export async function lookupCountry(ip?: string | null): Promise<string | null> {
  if (!ip || isPrivateIp(ip)) return null;
  if (cache.has(ip)) return cache.get(ip) ?? null;
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as {
      success?: boolean;
      country_code?: string;
    };
    const code = json.success && json.country_code ? json.country_code : null;
    cache.set(ip, code);
    return code;
  } catch {
    cache.set(ip, null);
    return null;
  }
}
