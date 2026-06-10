"use client";

/**
 * step-type.tsx — Step 2: Budget Type (Personal / Shared).
 *
 * Two full-card option cards. Active state is a 2-px primary ring +
 * primary-tinted bg + primary icon — no side-stripe border (impeccable
 * absolute ban). All copy via `onboarding.wizard.type.*`.
 */
import { User, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type BudgetKind = "PRIVATE" | "SHARED";

interface StepTypeProps {
  value: BudgetKind;
  onChange: (v: BudgetKind) => void;
}

interface Option {
  kind: BudgetKind;
  labelKey: "personal_label" | "shared_label";
  subKey: "personal_sub" | "shared_sub";
  testIdSuffix: "personal" | "shared";
  Icon: LucideIcon;
}

const OPTIONS: Option[] = [
  {
    kind: "PRIVATE",
    labelKey: "personal_label",
    subKey: "personal_sub",
    testIdSuffix: "personal",
    Icon: User,
  },
  {
    kind: "SHARED",
    labelKey: "shared_label",
    subKey: "shared_sub",
    testIdSuffix: "shared",
    Icon: Users,
  },
];

export function StepType({ value, onChange }: StepTypeProps) {
  const t = useTranslations("onboarding.wizard.type");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--body-on-dark)]">
          {t("heading")}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {t("subheading")}
        </p>
      </div>
      <div className="space-y-3" role="radiogroup" aria-label={t("group_aria")}>
        {OPTIONS.map(({ kind, labelKey, subKey, testIdSuffix, Icon }) => {
          const active = value === kind;
          const label = t(labelKey);
          return (
            <label
              key={kind}
              data-testid={`wizard-type-${testIdSuffix}`}
              className={cn(
                "flex cursor-pointer items-start gap-4 rounded-[var(--radius-md)] border px-4 py-4 transition-colors",
                active
                  ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/40 bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]"
                  : "border-[var(--hairline-on-dark)] hover:border-[var(--muted)] hover:bg-[var(--surface-elevated-dark)]/40",
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
                  active
                    ? "text-[var(--primary)]"
                    : "text-[var(--body-on-dark)]",
                )}
              />
              <div>
                <p className="text-sm font-semibold text-[var(--body-on-dark)]">
                  {label}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t(subKey)}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
