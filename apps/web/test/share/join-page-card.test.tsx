/**
 * join-page-card.test.tsx — Wave 0 RED stub for SHRD-04
 *
 * Covers: 6 join-card states (loading, valid, already-member, expired, invalid, error)
 * Filled by Plan 06-07.
 *
 * @wave 0 stub — intentionally skipped until Plan 06-07
 */
import { describe, it } from "vitest";

// TODO: Plan 06-07 — import JoinPageCard from "@/components/share/join-page-card"

describe.skip("JoinPageCard — 6 join-card states (SHRD-04)", () => {
  it.todo("loading state: shows skeleton while resolving invite token");
  it.todo("valid state: shows budget name + Accept button");
  it.todo("already-member state: shows info message + go to budget link");
  it.todo("expired state: shows expiry message + request new invite CTA");
  it.todo("invalid state: shows invalid token error");
  it.todo("error state: shows generic error + retry button");
});
