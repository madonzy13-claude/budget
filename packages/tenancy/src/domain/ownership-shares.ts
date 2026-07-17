export class InvalidShareTotal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShareTotal";
  }
}

/** Ownership shares must be integers in [0,100] and sum to exactly 100. */
export function validateShares(
  shares: { userId: string; pct: number }[],
): void {
  let total = 0;
  for (const s of shares) {
    if (!Number.isInteger(s.pct) || s.pct < 0 || s.pct > 100) {
      throw new InvalidShareTotal(`invalid share ${s.pct} for ${s.userId}`);
    }
    total += s.pct;
  }
  if (total !== 100) {
    throw new InvalidShareTotal(`shares total ${total}, must be 100`);
  }
}
