"use client";

/**
 * transaction-capture-form.tsx — Sheet drawer for capturing EXPENSE / INCOME / TRANSFER.
 * Per UI-SPEC: 480px desktop / full-screen mobile; 40px BinancePlex amount input.
 *
 * Currency picker is ALLOWLIST-BOUND — options come from the `currencies` prop
 * (sourced via `listSupportedCurrencies()` server action in the parent RSC page).
 * The picker CANNOT render codes absent from `budgeting.supported_currencies`.
 *
 * Idempotency-Key is generated once per form mount and submitted as an HTTP header.
 * FX preview is fetched on amount/currency/date change when currencyOrig ≠ defaultCurrency.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CurrencyPicker,
  type CurrencyOption,
} from "@/components/common/currency-picker";
import { clientApiFetch } from "@/lib/budget-fetch";

interface FxQuote {
  rate: string;
  fxRateDate: string;
  provider: string;
  isStale: boolean;
}

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

export interface TransactionCaptureFormProps {
  /** Allowlist from `listSupportedCurrencies()` server action — picker renders only these codes. */
  currencies: CurrencyOption[];
  accounts?: AccountOption[];
  categories?: CategoryOption[];
  /** Workspace default currency (e.g. "EUR") — used to detect cross-currency transactions. */
  defaultCurrency?: string;
  onSuccess?: (result: { ledgerId?: string; transferGroupId?: string }) => void;
  onCancel?: () => void;
}

const formSchema = z.object({
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  amountOrig: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive number")
    .refine((v) => parseFloat(v) > 0, "Amount must be greater than 0"),
  currencyOrig: z.string().min(3).max(5),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  accountId: z.string().uuid("Select an account"),
  toAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

function generateIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = parseInt(c, 10);
    return (n ^ ((Math.random() * 16) >> (n / 4))).toString(16);
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionCaptureForm({
  currencies,
  accounts = [],
  categories = [],
  defaultCurrency = "EUR",
  onSuccess,
  onCancel,
}: TransactionCaptureFormProps) {
  const t = useTranslations("budgeting");

  // Idempotency-Key generated once per form mount.
  const [idempotencyKey] = useState(() => generateIdempotencyKey());
  const [serverError, setServerError] = useState<string | null>(null);
  const [fxPreview, setFxPreview] = useState<FxQuote | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kind: "EXPENSE",
      amountOrig: "",
      currencyOrig: defaultCurrency,
      transactionDate: todayIso(),
      accountId: accounts[0]?.id ?? "",
      note: "",
    },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;
  const kind = form.watch("kind");
  const currencyOrig = form.watch("currencyOrig");
  const transactionDate = form.watch("transactionDate");
  const amountOrig = form.watch("amountOrig");

  // Fetch FX preview when currency / date changes and currency ≠ default.
  const fetchFxPreview = useCallback(async () => {
    if (!currencyOrig || !transactionDate || currencyOrig === defaultCurrency) {
      setFxPreview(null);
      return;
    }
    if (!amountOrig || parseFloat(amountOrig) <= 0) {
      setFxPreview(null);
      return;
    }
    setFxLoading(true);
    try {
      const res = await clientApiFetch(
        `/fx/rate?from=${currencyOrig}&to=${defaultCurrency}&date=${transactionDate}`,
      );
      if (res.ok) {
        const data = (await res.json()) as FxQuote;
        setFxPreview(data);
      } else {
        setFxPreview(null);
      }
    } catch {
      setFxPreview(null);
    } finally {
      setFxLoading(false);
    }
  }, [currencyOrig, transactionDate, amountOrig, defaultCurrency]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFxPreview();
    }, 500); // debounce 500ms
    return () => clearTimeout(timer);
  }, [fetchFxPreview]);

  const currencyOptions: CurrencyOption[] = useMemo(
    () =>
      currencies.map((c): CurrencyOption => {
        const opt: CurrencyOption = {
          value: c.value,
          label: c.label,
        };
        if (c.symbol != null) opt.symbol = c.symbol;
        if (c.kind != null) opt.kind = c.kind;
        return opt;
      }),
    [currencies],
  );

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const body = {
        kind: values.kind,
        amountOrig: values.amountOrig,
        currencyOrig: values.currencyOrig,
        transactionDate: values.transactionDate,
        accountId: values.accountId,
        ...(values.kind !== "TRANSFER" && values.categoryId
          ? { categoryId: values.categoryId }
          : {}),
        ...(values.kind === "TRANSFER" && values.toAccountId
          ? { toAccountId: values.toAccountId }
          : {}),
        ...(values.note ? { note: values.note } : {}),
        ...(fxPreview && currencyOrig !== defaultCurrency
          ? {
              fxPreview: {
                rate: fxPreview.rate,
                fxRateDate: fxPreview.fxRateDate,
              },
            }
          : {}),
      };

      const res = await clientApiFetch("/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const data = (await res.json()) as {
          error: string;
          freshRate?: FxQuote;
        };
        if (data.freshRate) {
          setFxPreview(data.freshRate);
        }
        setServerError(t("fx.stale409Title"));
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setServerError(err.error ?? "Something went wrong");
        return;
      }

      const result = (await res.json()) as {
        ledgerId?: string;
        transferGroupId?: string;
      };
      const kindKey =
        values.kind === "EXPENSE"
          ? "saveExpense"
          : values.kind === "INCOME"
            ? "saveIncome"
            : "saveTransfer";
      toast.success(t(`transactions.capture.${kindKey}`));
      onSuccess?.(result);
    } catch {
      setServerError("Network error — check your connection");
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {/* Phase 2: only EXPENSE is exposed in the UI. INCOME / TRANSFER
            remain in the contract for later phases but the user never picks. */}

        {/* Amount + currency */}
        <div className="flex gap-3">
          <FormField
            control={form.control}
            name="amountOrig"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t("transactions.capture.amountLabel")}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={t("transactions.capture.amountLabel")}
                    data-testid="amount-input"
                    style={{
                      fontSize: "40px",
                      fontFamily: "var(--font-binom)",
                      fontWeight: 600,
                      height: "64px",
                    }}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currencyOrig"
            render={({ field }) => (
              <FormItem className="w-36">
                <FormLabel>{t("transactions.capture.currencyLabel")}</FormLabel>
                <FormControl>
                  <CurrencyPicker
                    value={field.value}
                    onSelect={field.onChange}
                    options={currencyOptions}
                    placeholder="Currency"
                    aria-label={t("transactions.capture.currencyLabel")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* FX preview row */}
        {fxLoading && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Fetching rate…</span>
          </div>
        )}
        {!fxLoading &&
          fxPreview &&
          currencyOrig !== defaultCurrency &&
          amountOrig && (
            <div
              className="rounded-[var(--radius-sm)] bg-[var(--surface-card-dark)] px-3 py-2 text-xs text-[var(--muted-foreground)]"
              data-testid="fx-preview"
            >
              {t("fx.preview", {
                amount: (
                  parseFloat(amountOrig) * parseFloat(fxPreview.rate)
                ).toFixed(2),
                currency: defaultCurrency,
                rate: fxPreview.rate,
                provider: fxPreview.provider,
              })}
            </div>
          )}

        {/* Transaction date */}
        <FormField
          control={form.control}
          name="transactionDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("transactions.capture.dateLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  aria-label={t("transactions.capture.dateLabel")}
                  data-testid="date-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Account */}
        {accounts.length > 0 && (
          <FormField
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("transactions.capture.accountLabel")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Category — EXPENSE only (the only kind exposed in Phase-2 UI). */}
        {categories.length > 0 && (
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("transactions.capture.categoryLabel")}</FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Note */}
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("transactions.capture.noteLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Optional note"
                  aria-label={t("transactions.capture.noteLabel")}
                  data-testid="note-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t("accounts.form.cancelButton")}
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
            disabled={isSubmitting}
            data-testid="submit-button"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t(
                `transactions.capture.${
                  kind === "EXPENSE"
                    ? "saveExpense"
                    : kind === "INCOME"
                      ? "saveIncome"
                      : "saveTransfer"
                }`,
              )
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
