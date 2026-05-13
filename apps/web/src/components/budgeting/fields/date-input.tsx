"use client";

import { Input } from "@/components/ui/input";

interface DateInputProps {
  value: string; // ISO YYYY-MM-DD
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  id?: string;
}

export function DateInput({ value, onChange, ...rest }: DateInputProps) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10"
      {...rest}
    />
  );
}
