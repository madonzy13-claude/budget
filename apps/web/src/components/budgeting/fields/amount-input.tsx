"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AmountInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  className?: string;
  id?: string;
}

export function AmountInput({
  value,
  onChange,
  className,
  ...rest
}: AmountInputProps) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-10 font-[var(--font-numeric)] tabular-nums", className)}
      {...rest}
    />
  );
}
