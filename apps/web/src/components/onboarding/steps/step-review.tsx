/**
 * step-review.tsx — Step 5: Read-only review summary
 */

interface StepReviewProps {
  name: string;
  currency: string;
  kind: "PRIVATE" | "SHARED";
  categories: string[];
}

export function StepReview({
  name,
  currency,
  kind,
  categories,
}: StepReviewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--body-on-dark)]">
          Ready to go?
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {"Here's what you set up:"}
        </p>
      </div>
      <div className="space-y-3 rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">Budget name</span>
          <span className="text-sm font-semibold text-[var(--body-on-dark)]">
            {name || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">Currency</span>
          <span className="text-sm font-semibold text-[var(--body-on-dark)]">
            {currency || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">Type</span>
          <span className="text-sm font-semibold text-[var(--body-on-dark)]">
            {kind === "PRIVATE" ? "Personal" : "Shared"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">Categories</span>
          <span className="text-sm font-semibold text-[var(--body-on-dark)]">
            {categories.length} selected
          </span>
        </div>
      </div>
    </div>
  );
}
