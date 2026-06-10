/**
 * onboarding-progress-repo.ts — Port interface for onboarding progress persistence.
 * ONBD-07: tracks 5-step wizard progress, one row per user (USER-SCOPED).
 */

export interface OnboardingProgressRepo {
  get(
    userId: string,
  ): Promise<{ step: number; completedAt: string | null } | null>;
  upsert(
    userId: string,
    step: number,
    completedAt?: string | null,
  ): Promise<void>;
}
