/**
 * parse-user-agent.ts — shorten a raw User-Agent string to a readable
 * "{browser} on {os}" for the active-sessions list (UAT #5).
 *
 * A compact built-in parser (no external dependency): covers every browser/OS the
 * app's users actually have. Order matters — Edge/Opera/Samsung masquerade as
 * Chrome, Chrome's UA also contains "Safari", and iOS browsers all wrap WebKit.
 */
export interface ParsedUA {
  browser: string;
  os: string;
}

function detectBrowser(ua: string): string {
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bOPR\/|\bOpera\b/.test(ua)) return "Opera";
  if (/\bSamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return "Firefox";
  if (/\bCriOS\/|\bChrome\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua)) return "Safari";
  return "";
}

function detectOS(ua: string): string {
  if (/\bWindows NT\b/.test(ua)) return "Windows";
  if (/\biPhone\b/.test(ua)) return "iOS";
  if (/\biPad\b/.test(ua)) return "iPadOS";
  if (/\bAndroid\b/.test(ua)) return "Android";
  if (/\bCrOS\b/.test(ua)) return "ChromeOS";
  // Mac must come AFTER iPhone/iPad (those UAs also say "like Mac OS X").
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "macOS";
  if (/\bLinux\b/.test(ua)) return "Linux";
  return "";
}

export function parseUserAgent(ua?: string | null): ParsedUA {
  if (!ua) return { browser: "", os: "" };
  return { browser: detectBrowser(ua), os: detectOS(ua) };
}
