/**
 * step-type.tsx — Step 3: Budget Type (Personal / Shared)
 * Two full-card option cards. Selected = yellow left border + yellow ring.
 */
import { Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type BudgetKind = "PRIVATE" | "SHARED";

interface StepTypeProps {
  value: BudgetKind;
  onChange: (v: BudgetKind) => void;
}

const OPTIONS: {
  kind: BudgetKind;
  label: string;
  subtext: string;
  Icon: typeof Lock;
}[] = [
  {
    kind: "PRIVATE",
    label: "Personal",
    subtext: "Just for you",
    Icon: Lock,
  },
  {
    kind: "SHARED",
    label: "Shared",
    subtext: "Invite family or household members",
    Icon: Users,
  },
];

export function StepType({ value, onChange }: StepTypeProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--body-on-dark)]">
          Who is this budget for?
        </h2>
      </div>
      <div className="space-y-3" role="radiogroup" aria-label="Budget type">
        {OPTIONS.map(({ kind, label, subtext, Icon }) => {
          const active = value === kind;
          return (
            <label
              key={kind}
              className={cn(
                "flex cursor-pointer items-start gap-4 rounded-[var(--radius-md)] border px-4 py-4 transition-all",
                active
                  ? "border-l-4 border-[var(--primary)] ring-1 ring-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]"
                  : "border-[var(--hairline-on-dark)] hover:border-[var(--muted)]",
              )}
            >
              <input
                type="radio"
                name="budget-kind"
                value={kind}
                checked={active}
                onChange={() => onChange(kind)}
                className="sr-only"
                aria-label={label}
              />
              <Icon
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  active ? "text-[var(--primary)]" : "text-[var(--muted)]",
                )}
              />
              <div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    active
                      ? "text-[var(--body-on-dark)]"
                      : "text-[var(--body-on-dark)]",
                  )}
                >
                  {label}
                </p>
                <p className="text-sm text-[var(--muted)]">{subtext}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
