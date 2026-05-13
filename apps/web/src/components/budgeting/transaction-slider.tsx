"use client";

/**
 * transaction-slider.tsx — Sheet drawer for creating/editing a transaction.
 * Per UI-SPEC §9: 480px desktop / 100vw mobile; RHF + Zod validation.
 * Composes DateInput, AmountInput, CurrencyPicker, FxPreviewLine, FxFreshnessBadge.
 * Delete confirmation via AlertDialog (T-04-04-08 mitigation).
 */
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/budgeting/fields/date-input";
import { AmountInput } from "@/components/budgeting/fields/amount-input";
import { FxPreviewLine } from "@/components/budgeting/fields/fx-preview-line";
import { FxFreshnessBadge } from "@/components/budgeting/fx-freshness-badge";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";

interface FxQuote {
  rate: string;
  fxRateDate: string;
  provider: string;
  isStale: boolean;
}

export interface TransactionSliderProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: "create" | "edit";
  budgetId: string;
  month: string;
  budgetCurrency: string;
  categories: Array<{ id: string; name: string; sortIndex: number }>;
  initial?: {
    txId: string;
    date: string;
    categoryId: string;
    amountOriginalCents: string;
    currencyOriginal: string;
    note?: string | null;
  };
  prefillCategoryId?: string;
}

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().min(1),
  amountOrig: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currencyOrig: z.string().length(3),
  note: z.string().max(500).nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function centsToDecimal(cents: string): string {
  const n = parseInt(cents, 10);
  return (n / 100).toFixed(2);
}

export function TransactionSlider({
  open,
  onOpenChange,
  mode,
  budgetId,
  month,
  budgetCurrency,
  categories,
  initial,
  prefillCategoryId,
}: TransactionSliderProps) {
  const t = useTranslations("grid");
  const [idempotencyKey] = useState(() => generateIdempotencyKey());
  const [fxPreview, setFxPreview] = useState<FxQuote | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: initial?.date ?? todayIso(),
      categoryId: initial?.categoryId ?? prefillCategoryId ?? categories[0]?.id ?? "",
      amountOrig: initial?.amountOriginalCents
        ? centsToDecimal(initial.amountOriginalCents)
        : "",
      currencyOrig: initial?.currencyOriginal ?? budgetCurrency,
      note: initial?.note ?? "",
    },
  });

  const { isSubmitting } = form.formState;
  const currencyOrig = form.watch("currencyOrig");
  const amountOrig = form.watch("amountOrig");
  const date = form.watch("date");

  const fetchFxPreview = useCallback(async () => {
    if (!currencyOrig || currencyOrig === budgetCurrency) {
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
        `/fx/rate?from=${currencyOrig}&to=${budgetCurrency}&date=${date}`,
      );
      if (res.ok) {
        setFxPreview((await res.json()) as FxQuote);
      } else {
        setFxPreview(null);
      }
    } catch {
      setFxPreview(null);
    } finally {
      setFxLoading(false);
    }
  }, [currencyOrig, budgetCurrency, amountOrig, date]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFxPreview();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchFxPreview]);

  async function onSubmit(values: FormValues) {
    const body: Record<string, unknown> = {
      categoryId: values.categoryId,
      date: values.date,
      amountOrig: values.amountOrig,
      currencyOrig: values.currencyOrig,
      ...(values.note ? { note: values.note } : {}),
      ...(fxPreview && values.currencyOrig !== budgetCurrency
        ? { fxPreview: { rate: fxPreview.rate, fxRateDate: fxPreview.fxRateDate } }
        : {}),
    };

    let res: Response;
    if (mode === "create") {
      res = await clientApiFetch(`/budgets/${budgetId}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } else {
      res = await clientApiFetch(
        `/budgets/${budgetId}/transactions/${initial!.txId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify(body),
        },
      );
    }

    if (res.status === 409) {
      const data = (await res.json()) as { error: string; freshRate?: FxQuote };
      if (data.freshRate) setFxPreview(data.freshRate);
      toast.error(t("error.fxStale"));
      return;
    }

    if (!res.ok) {
      toast.error(t("error.sliderSave"));
      return;
    }

    onOpenChange(false);
  }

  async function handleDelete() {
    if (!initial?.txId) return;
    setIsDeleting(true);
    try {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/transactions/${initial.txId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setDeleteOpen(false);
        onOpenChange(false);
      } else {
        toast.error(t("error.sliderSave"));
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const showFxLine =
    !fxLoading &&
    fxPreview &&
    currencyOrig !== budgetCurrency &&
    amountOrig;

  const showStaleBadge =
    fxPreview &&
    !fxPreview.isStale === false;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-screen sm:w-[480px] sm:max-w-[480px] bg-[var(--surface-card-dark)] p-0 flex flex-col overflow-y-auto"
          data-testid="txn-slider-content"
        >
          <SheetHeader className="px-6 py-4 border-b border-[var(--hairline-dark)]">
            <SheetTitle className="text-xl font-semibold text-[var(--body-on-dark)]">
              {mode === "create"
                ? t("txnSlider.header.create")
                : t("txnSlider.header.edit")}
            </SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col flex-1 px-6 py-4 gap-4"
              noValidate
            >
              {/* Date */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("txnSlider.field.date")}
                    </FormLabel>
                    <FormControl>
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                        aria-invalid={!!form.formState.errors.date}
                        id="txn-slider-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category */}
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("txnSlider.field.category")}
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Amount + Currency */}
              <div className="flex gap-3">
                <FormField
                  control={form.control}
                  name="amountOrig"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-sm text-[var(--muted-foreground)]">
                        {t("txnSlider.field.amount")}
                      </FormLabel>
                      <FormControl>
                        <AmountInput
                          value={field.value}
                          onChange={field.onChange}
                          aria-invalid={!!form.formState.errors.amountOrig}
                          id="txn-slider-amount"
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
                    <FormItem className="w-32">
                      <FormLabel className="text-sm text-[var(--muted-foreground)]">
                        {t("txnSlider.field.currency")}
                      </FormLabel>
                      <FormControl>
                        <CurrencyPicker
                          value={field.value}
                          onSelect={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* FX preview line — only when currency !== budgetCurrency */}
              {fxLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              )}
              {showFxLine && fxPreview && (
                <FxPreviewLine
                  original={{ amount: amountOrig, currency: currencyOrig }}
                  converted={{
                    amount: (parseFloat(amountOrig) * parseFloat(fxPreview.rate)).toFixed(2),
                    currency: budgetCurrency,
                  }}
                  rate={fxPreview.rate}
                  asOf={fxPreview.fxRateDate}
                />
              )}
              {showStaleBadge && fxPreview && (
                <FxFreshnessBadge
                  fxRateDate={fxPreview.fxRateDate}
                  provider={fxPreview.provider}
                />
              )}

              {/* Note */}
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("txnSlider.field.note")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        id="txn-slider-note"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SheetFooter className="mt-auto pt-4 flex gap-3">
                {/* Delete button — edit mode only */}
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    disabled={isSubmitting || isDeleting}
                    className="flex-1"
                  >
                    {t("txn.action.delete")}
                  </Button>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "create" ? (
                    t("txnSlider.cta.create")
                  ) : (
                    t("txnSlider.cta.save")
                  )}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation AlertDialog (T-04-04-08 mitigation) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.deleteTxn.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.deleteTxn.body", { month })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("confirm.deleteTxn.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("confirm.deleteTxn.cta")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
