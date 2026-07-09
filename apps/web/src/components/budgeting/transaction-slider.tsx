"use client";

/**
 * transaction-slider.tsx — Sheet drawer for creating/editing a transaction.
 * Per UI-SPEC §9: 480px desktop / 100vw mobile; RHF + Zod validation.
 * Composes DateInput, AmountInput, CurrencyPicker, FxPreviewLine, FxFreshnessBadge.
 * Delete confirmation via AlertDialog (T-04-04-08 mitigation).
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { centsToBare, centsToDisplayCompact } from "@/lib/cents-format";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { Temporal } from "temporal-polyfill";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { parseDecimal } from "@/lib/decimal";
import { FxPreviewLine } from "@/components/budgeting/fields/fx-preview-line";
import { FxFreshnessBadge } from "@/components/budgeting/fx-freshness-badge";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
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

/** Schema factory: the future-date cap is the last day of the current month IN
 *  THE USER'S TIMEZONE (r31 item 1), so it matches the picker max + default date. */
function makeSchema(tz: string) {
  return z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      // No future-dated transactions — cap at the last day of the current month.
      .refine((d) => d <= lastDayOfCurrentMonthIso(tz), {
        message: "future_date_not_allowed",
      }),
    categoryId: z.string().min(1),
    // Accept BOTH "." and "," as the decimal separator — parseDecimal normalises
    // the comma to a dot on submit. A period-only regex here rejected "10,50"
    // before submit ever ran, so the comma fix in onSubmit could never apply.
    amountOrig: z.string().regex(/^\d+([.,]\d{1,2})?$/),
    currencyOrig: z.string().length(3),
    note: z.string().max(500).nullable().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** Today's date in the user's timezone (r31 item 1) — the default for a new txn. */
function todayIso(tz: string = "UTC"): string {
  return Temporal.Now.plainDateISO(tz).toString();
}

/** Last day of the current month IN THE USER'S TIMEZONE (matching todayIso).
 *  Transactions cannot be dated into a future month — the date picker's max. */
function lastDayOfCurrentMonthIso(tz: string = "UTC"): string {
  const today = Temporal.Now.plainDateISO(tz);
  return today.with({ day: today.daysInMonth }).toString();
}

// Prefill the amount field using the same rules as the grid (centsToBare):
// drop a `.00` fraction (`3600` → "36"), pad a non-zero fraction to two digits
// (`4250` → "42.50"). Returns a raw period-separated string — no locale
// separators — so parseFloat round-trips it on submit.
function centsToInputValue(cents: string): string {
  const n = parseInt(cents, 10);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = n < 0 ? "-" : "";
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
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
  const locale = useLocale();
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  const [idempotencyKey] = useState(() => generateIdempotencyKey());

  function invalidateGrid() {
    qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
    qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId, month] });
    qc.invalidateQueries({ queryKey: ["drafts", budgetId, month] });
    // A confirmed/edited/deleted transaction re-derives the reserve pool (any
    // month) and the RESERVE_TOPUP mismatch — refresh reserves tab + pill badge.
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
  }
  const [fxPreview, setFxPreview] = useState<FxQuote | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Sheet outside-detection callbacks read the latest deleteOpen via a ref so
  // a stale closure can't race with a fast user tap on the AlertDialog cancel.
  const deleteOpenRef = useRef(false);
  useEffect(() => {
    deleteOpenRef.current = deleteOpen;
  }, [deleteOpen]);

  // Today / month-cap follow the user's timezone (r31 item 1).
  const userTz = useUserTimezone();
  const schema = useMemo(() => makeSchema(userTz), [userTz]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: initial?.date ?? todayIso(userTz),
      categoryId:
        initial?.categoryId ?? prefillCategoryId ?? categories[0]?.id ?? "",
      amountOrig: initial?.amountOriginalCents
        ? centsToInputValue(initial.amountOriginalCents)
        : "",
      currencyOrig: initial?.currencyOriginal ?? budgetCurrency,
      note: initial?.note ?? "",
    },
  });

  const { isSubmitting } = form.formState;
  const currencyOrig = form.watch("currencyOrig");
  const amountOrig = form.watch("amountOrig");
  const date = form.watch("date");

  // Confirm before closing if the form has unsaved edits. Save/delete bypass
  // this because they reset the form / leave through an intentional path.
  // Also: while the delete-confirmation AlertDialog is owning the interaction,
  // ignore any close attempt that bubbles up to the Sheet.
  function handleOpenChange(next: boolean) {
    if (!next && deleteOpenRef.current) return;
    if (!next && form.formState.isDirty && !isSubmitting && !isDeleting) {
      if (
        typeof window !== "undefined" &&
        !window.confirm(t("confirm.discardChanges"))
      ) {
        return;
      }
    }
    onOpenChange(next);
  }

  // RHF defaultValues only apply on first mount. The slider is permanently
  // mounted with open toggled by parent state, and edit mode receives `initial`
  // only when the pen chip is clicked — so without an explicit reset() the form
  // keeps its first-mount defaults (today / empty) instead of the txn values.
  useEffect(() => {
    if (open) {
      form.reset({
        date: initial?.date ?? todayIso(userTz),
        categoryId:
          initial?.categoryId ?? prefillCategoryId ?? categories[0]?.id ?? "",
        amountOrig: initial?.amountOriginalCents
          ? centsToInputValue(initial.amountOriginalCents)
          : "",
        currencyOrig: initial?.currencyOriginal ?? budgetCurrency,
        note: initial?.note ?? "",
      });
    }
  }, [open, initial?.txId, userTz]);

  const fetchFxPreview = useCallback(async () => {
    if (!currencyOrig || currencyOrig === budgetCurrency) {
      setFxPreview(null);
      return;
    }
    if (!amountOrig || (parseDecimal(amountOrig) ?? 0) <= 0) {
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
    // API contract is snake_case with integer cents (createSchema / patchSchema).
    // Sending camelCase keys here would silently drop most fields server-side.
    // parseDecimal accepts both "." and "," as the decimal separator → cents.
    const amountCents = parseDecimal(values.amountOrig) ?? 0;
    const body: Record<string, unknown> = {
      date: values.date,
      category_id: values.categoryId,
      amount_original_cents: amountCents,
      currency_original: values.currencyOrig,
      ...(values.note ? { note: values.note } : {}),
    };

    let res: Response;
    try {
      if (mode === "create") {
        res = await clientApiWrite(`/budgets/${budgetId}/transactions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        });
      } else {
        res = await clientApiWrite(
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
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      // RHF resets isSubmitting when onSubmit settles, so no manual reset needed.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("error.sliderSave"));
      return;
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

    invalidateGrid();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!initial?.txId) return;
    setIsDeleting(true);
    try {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/transactions/${initial.txId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setDeleteOpen(false);
        invalidateGrid();
        onOpenChange(false);
      } else {
        toast.error(t("error.sliderSave"));
      }
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      // The finally below resets isDeleting so the spinner never sticks.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("error.sliderSave"));
    } finally {
      setIsDeleting(false);
    }
  }

  const showFxLine =
    !fxLoading && fxPreview && currencyOrig !== budgetCurrency && amountOrig;

  const showStaleBadge = fxPreview && !fxPreview.isStale === false;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-screen sm:w-[480px] sm:max-w-[480px] bg-[var(--surface-card-dark)] p-0 flex flex-col overflow-y-auto"
          data-testid="txn-slider-content"
          // iOS standalone PWA: Radix auto-focuses the first field on open →
          // the soft keyboard pans the layout viewport up (no browser chrome to
          // absorb it), shifting the whole sheet up and hiding the title/X.
          // Prevent autofocus; the user taps to focus, and transaction-row.tsx
          // already scrolls focused inputs into view.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
          // The delete-confirmation AlertDialog renders in its own portal, so
          // Radix's outside-detection treats clicks/escape inside it as
          // "outside" the Sheet and would close both. Keep the Sheet open
          // while the AlertDialog owns the interaction.
          onPointerDownOutside={(e) => {
            if (deleteOpenRef.current) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (deleteOpenRef.current) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            if (deleteOpenRef.current) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (deleteOpenRef.current) e.preventDefault();
          }}
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
              {/* Date — capped width so it doesn't stretch across the form */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="max-w-[12rem]">
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("txnSlider.field.date")}
                    </FormLabel>
                    <FormControl>
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                        max={lastDayOfCurrentMonthIso(userTz)}
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
                          variant="field"
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
                    // Compact rule via centsToBare (no symbol — FxPreviewLine
                    // appends the currency code) so the converted preview drops
                    // a whole-unit .00 like every other amount.
                    amount: centsToBare(
                      String(
                        Math.round(
                          ((parseDecimal(amountOrig) ?? 0) / 100) *
                            parseFloat(fxPreview.rate) *
                            100,
                        ),
                      ),
                      locale,
                    ),
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
                {/* h-14 (UAT-Phase6-Test7 retest #2) — bumped from
                    h-12 in lockstep with the recurring slider so both
                    sliders feel identical on mobile. */}
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    disabled={isSubmitting || isDeleting}
                    className="h-14 text-base w-full sm:flex-1"
                  >
                    {t("txn.action.delete")}
                  </Button>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-14 text-base w-full sm:flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
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
        <AlertDialogContent
          // Focus the destructive action so a single Enter key confirms.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const btn = document.querySelector<HTMLButtonElement>(
              '[data-testid="txn-slider-delete-confirm"]',
            );
            btn?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.deleteTxn.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.deleteTxn.body", {
                amount: initial
                  ? centsToDisplayCompact(
                      initial.amountOriginalCents,
                      initial.currencyOriginal,
                      locale,
                    )
                  : "",
                date: initial
                  ? new Date(`${initial.date}T00:00:00`).toLocaleDateString(
                      locale,
                      { year: "numeric", month: "long", day: "numeric" },
                    )
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("confirm.deleteTxn.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="txn-slider-delete-confirm"
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
