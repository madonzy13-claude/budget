import type { EmailSender, EmailSendArgs } from "@budget/shared-kernel";

// RFC 2606 reserves example.{com,net,org,edu} and the TLDs .test/.example/
// .invalid/.localhost for documentation and testing; RFC 6762 reserves the
// .local suffix for mDNS. None can receive real mail. Every E2E address
// (@test.local, @example.com, @example.test) lands here.
const RESERVED_TLD_SUFFIXES = [
  ".local",
  ".test",
  ".invalid",
  ".localhost",
  ".example",
];
const RESERVED_BARE_HOSTS = ["localhost"];
const RESERVED_DOMAINS = [
  "example.com",
  "example.net",
  "example.org",
  "example.edu",
];

/**
 * True when the recipient's domain can never receive real mail. The real-SMTP
 * guard uses this to refuse delivery so test/E2E addresses never reach a real
 * provider (which would bounce and hurt sending-domain reputation).
 */
export function isReservedEmailDomain(to: string): boolean {
  const at = to.lastIndexOf("@");
  if (at === -1) return false;
  const domain = to
    .slice(at + 1)
    .trim()
    .toLowerCase();
  if (!domain) return false;
  if (RESERVED_DOMAINS.includes(domain)) return true;
  if (RESERVED_BARE_HOSTS.includes(domain)) return true;
  return RESERVED_TLD_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

// Local mail catchers (mailpit/localhost). A stack pointed at one is a dev/CI
// stack, not a real provider.
const LOCAL_MAIL_HOSTS = [
  "mailpit",
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
];

/**
 * True when the SMTP host is a local mail catcher rather than a real provider.
 * boot only wraps a sender in {@link SkipReservedDomainsEmailSender} when the
 * host is NON-local, so a mailpit-pointed stack (CI/E2E) still delivers reserved
 * addresses to the catcher and email-verification flows keep working.
 */
export function isLocalMailHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return LOCAL_MAIL_HOSTS.includes(h) || h.endsWith(".local");
}

/**
 * Wraps a real email sender and drops recipients on reserved/test domains
 * before they reach the provider. Guarantees E2E (all @test.local etc.) never
 * triggers a real send, independent of stack configuration.
 */
export class SkipReservedDomainsEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly onSkip?: (to: string) => void,
  ) {}

  async send(args: EmailSendArgs): Promise<void> {
    if (isReservedEmailDomain(args.to)) {
      this.onSkip?.(args.to);
      return;
    }
    await this.inner.send(args);
  }
}
