/**
 * danger-zone-section.test.tsx — Wave 0 RED stub for SETT-08
 *
 * Covers: owner/non-owner controls + typed-name gate for archive/delete
 * Filled by Plan 06-05.
 *
 * @wave 0 stub — intentionally skipped until Plan 06-05
 */
import { describe, it } from "vitest";

// TODO: Plan 06-05 — import DangerZoneSection from "@/components/settings/danger-zone-section"

describe.skip("DangerZoneSection — owner/non-owner controls + typed-name gate (SETT-08)", () => {
  it.todo("owner sees Archive Budget button");
  it.todo("owner sees Delete Budget button");
  it.todo("non-owner sees disabled/hidden controls");
  it.todo("Delete button shows typed-name confirmation dialog");
  it.todo("confirm button disabled until typed name matches budget name exactly");
  it.todo("confirm button enabled when typed name matches");
});
