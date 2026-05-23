/**
 * step-name.tsx — Step 1: Budget Name input
 */
import { Input } from "@/components/ui/input";

interface StepNameProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

export function StepName({ value, onChange, error }: StepNameProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--body-on-dark)]">
          Name your budget
        </h2>
      </div>
      <div className="space-y-1.5">
        <Input
          type="text"
          data-testid="wizard-step1-name"
          placeholder="e.g. Family Budget 2026"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={80}
          aria-invalid={!!error}
          aria-describedby={error ? "name-error" : undefined}
          className="bg-[var(--surface-elevated-dark)] border-[var(--hairline-on-dark)] text-[var(--body-on-dark)] placeholder:text-[var(--muted)]"
        />
        {error && (
          <p
            id="name-error"
            role="alert"
            className="text-sm text-[var(--trading-down)]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
