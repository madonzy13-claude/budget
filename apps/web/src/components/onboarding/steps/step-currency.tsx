/**
 * step-currency.tsx — Step 2: Currency picker
 * Reuses CurrencyPicker pattern from display-currency-picker.tsx
 */
import { CurrencyPicker } from "@/components/common/currency-picker";

interface StepCurrencyProps {
  value: string;
  onChange: (v: string) => void;
}

export function StepCurrency({ value, onChange }: StepCurrencyProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--body-on-dark)]">
          Choose your currency
        </h2>
      </div>
      <div className="space-y-2">
        <CurrencyPicker
          value={value}
          onSelect={onChange}
          aria-label="Default currency"
        />
        <p className="text-sm text-[var(--muted)]">
          You can change this later until you add your first transaction.
        </p>
      </div>
    </div>
  );
}
