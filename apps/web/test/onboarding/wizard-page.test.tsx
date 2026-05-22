/**
 * wizard-page.test.tsx — Wave 0 RED stub for ONBD-02..06
 *
 * Covers: step-machine advance / validation across 5 wizard steps
 * Filled by Plan 06-06.
 *
 * @wave 0 stub — intentionally skipped until Plan 06-06
 */
import { describe, it } from "vitest";

// TODO: Plan 06-06 — import WizardPage from "@/app/(app)/onboarding/page"

describe.skip("WizardPage — step-machine advance and validation (ONBD-02..06)", () => {
  it.todo("step 1: welcome step renders and advances on Next");
  it.todo("step 2: budget name input validates non-empty");
  it.todo("step 3: currency selection persists selection");
  it.todo("step 4: members invite step is optional");
  it.todo("step 5: completion step shows summary and calls completedAt");
  it.todo("Back button returns to previous step");
  it.todo("wizard resumes from last saved step on reload");
  it.todo("completing step 5 persists completedAt via PUT /onboarding/progress");
});
