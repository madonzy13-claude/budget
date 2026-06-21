"use client";
/**
 * type-dropdown.tsx — Holding-type <Select> (Phase 9, INV-04 / D-16).
 *
 * shadcn Select with a lucide icon + translated label per 9-enum value. Icons
 * fixed by 09-UI-SPEC §Type enum. Preselected from a suggestion's asset class,
 * editable (reclassifiable).
 */
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  BarChart2,
  Landmark,
  Bitcoin,
  Building2,
  Package,
  Banknote,
  Home,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { HoldingType } from "@/hooks/use-investments";

/** 09-UI-SPEC §Type enum — lucide icon per holding type. */
export const HOLDING_TYPE_ICON: Record<HoldingType, LucideIcon> = {
  equities: TrendingUp,
  etf: BarChart2,
  bond: Landmark,
  crypto: Bitcoin,
  reit: Building2,
  commodity: Package,
  cash_fx: Banknote,
  real_estate: Home,
  other: MoreHorizontal,
};

export const HOLDING_TYPES: HoldingType[] = [
  "equities",
  "etf",
  "bond",
  "crypto",
  "reit",
  "commodity",
  "cash_fx",
  "real_estate",
  "other",
];

interface TypeDropdownProps {
  value: HoldingType;
  onChange: (value: HoldingType) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function TypeDropdown({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: TypeDropdownProps) {
  const t = useTranslations("budget.investments.type");
  const SelectedIcon = HOLDING_TYPE_ICON[value];

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as HoldingType)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} data-testid="holding-sheet-type">
        <SelectValue>
          <span className="flex items-center gap-2">
            <SelectedIcon className="h-4 w-4 text-[var(--body-on-dark)]" />
            <span>{t(value)}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {HOLDING_TYPES.map((type) => {
          const Icon = HOLDING_TYPE_ICON[type];
          return (
            <SelectItem key={type} value={type}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
                <span>{t(type)}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
