/**
 * step-categories.tsx — Step 4: Starter category multi-select chips
 * All selected by default. Selected = elevated bg + yellow border.
 * At least 1 required.
 */
import { cn } from "@/lib/utils";

export const STARTER_CATEGORIES = [
  "Housing",
  "Groceries",
  "Transport",
  "Eating Out",
  "Entertainment",
  "Health",
  "Subscriptions",
  "Other",
] as const;

interface StepCategoriesProps {
  selected: string[];
  onChange: (v: string[]) => void;
  error?: string;
}

export function StepCategories({
  selected,
  onChange,
  error,
}: StepCategoriesProps) {
  const toggle = (cat: string) => {
    if (selected.includes(cat)) {
      onChange(selected.filter((c) => c !== cat));
    } else {
      onChange([...selected, cat]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--body-on-dark)]">
          Pick your starter categories
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Adjust spending limits after you create the budget.
        </p>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Starter categories"
      >
        {STARTER_CATEGORIES.map((cat) => {
          const active = selected.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(cat)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "border border-[var(--primary)] bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
                  : "border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)] text-[var(--muted)]",
              )}
            >
              {cat}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--trading-down)]">
          {error}
        </p>
      )}
    </div>
  );
}
