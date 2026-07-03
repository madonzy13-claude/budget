"use client";

/**
 * category-slider.tsx — Sheet drawer for creating/editing a budget category.
 * Per UI-SPEC §10: same Sheet chrome as TransactionSlider.
 * Create flow: POST /categories → POST /categories/:id/limits (SCD-2).
 * Edit flow: PATCH /categories/:id + POST /categories/:id/limits.
 */
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { AmountInput } from "@/components/budgeting/fields/amount-input";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { cn } from "@/lib/utils";
// 260613-v1p: single source of truth for the 8 category palette colors.
import { CATEGORY_COLORS } from "@/lib/category-colors";

export interface CategorySliderProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: "create" | "edit";
  budgetId: string;
  budgetCurrency: string;
  initial?: {
    categoryId: string;
    name: string;
    plannedCents: string;
    cushionCents: string;
    colorKey: string | null;
  };
  txnsCount?: number;
  /**
   * The month the grid is viewing ('YYYY-MM'). The planned/cushion limit edit
   * is written for THIS month — past months are bounded to just that month,
   * the current month carries forward. Defaults to the current month.
   */
  month?: string;
  /**
   * Phase 6 onboarding rewrite: when false, the Cushion monthly amount
   * field is hidden in the slider. Submit still posts cushionAmount = 0
   * (or the existing value), so disabling the master flag doesn't strand
   * any UI for editing it. Default true preserves existing UX.
   */
  cushionEnabled?: boolean;
}

// Inputs hold a raw decimal-string ("60", "60.00"); amountToCents converts to
// integer cents at submit. Empty (= 0) lets a limit-less category be one click.
const amountOrEmpty = z.string().regex(/^(\d+(\.\d{1,2})?)?$/);

export const CUSHION_MODES = [
  "none",
  "needs_wants",
  "needs_only",
  "custom",
] as const;
export type CushionMode = (typeof CUSHION_MODES)[number];

const schema = z.object({
  name: z.string().min(1).max(60),
  // r32: BOTH create + edit build Planned from Needs + Wants and choose Cushion
  // by mode. Empty inputs (= 0) let a limit-less category be one click.
  needs: amountOrEmpty,
  wants: amountOrEmpty,
  cushionMode: z.enum(CUSHION_MODES),
  customCushion: amountOrEmpty,
  // 260613-v1p: iconKey removed (icon picker gone). colorKey persists.
  colorKey: z.string().nullable(),
});

type FormValues = z.infer<typeof schema>;

// Bare format matching the grid's centsToBare: drop a `.00` fraction
// (`10000` → "100"), pad a non-zero fraction to two digits (`320` → "3.20").
// Returns a raw period-separated string so parseFloat round-trips on submit.
function centsToDecimal(cents: string): string {
  const n = parseInt(cents, 10);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = n < 0 ? "-" : "";
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}

// Empty / NaN → 0 (inputs may be blank); otherwise round to cents.
function amountToCents(decimal: string): number {
  const n = parseFloat(decimal);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Derive the persisted {normalAmount, cushionAmount} (cents strings) from the
 * create-mode inputs. Planned = needs + wants; cushion follows the mode. Pure —
 * unit-tested directly, single source of truth for the create submit payload.
 */
export function computeSliderAmounts(input: {
  needs: string;
  wants: string;
  cushionMode: CushionMode;
  custom: string;
}): { normalAmount: string; cushionAmount: string } {
  const needs = amountToCents(input.needs);
  const wants = amountToCents(input.wants);
  const planned = needs + wants;
  let cushion: number;
  switch (input.cushionMode) {
    case "needs_wants":
      cushion = planned;
      break;
    case "needs_only":
      cushion = needs;
      break;
    case "custom":
      cushion = amountToCents(input.custom);
      break;
    case "none":
    default:
      cushion = 0;
  }
  return { normalAmount: String(planned), cushionAmount: String(cushion) };
}

/**
 * Map an existing category's stored {planned, cushion} cents back onto the
 * needs/wants + cushion-mode model for edit prefill. The needs/wants split is
 * not persisted (only the planned total is), so Needs = planned and Wants = 0;
 * the user can re-split. Cushion mode is inferred: 0 → none, == planned →
 * needs+wants, otherwise → custom (carrying the amount).
 */
export function prefillFromInitial(initial?: {
  plannedCents?: string;
  cushionCents?: string;
}): {
  needs: string;
  wants: string;
  cushionMode: CushionMode;
  customCushion: string;
} {
  const planned = initial?.plannedCents ?? "";
  const cushion = initial?.cushionCents ?? "";
  const cushionN = amountToCents(centsToDecimalSafe(cushion));
  const plannedN = amountToCents(centsToDecimalSafe(planned));
  let cushionMode: CushionMode = "none";
  if (cushionN > 0)
    cushionMode = cushionN === plannedN ? "needs_wants" : "custom";
  return {
    needs: planned ? centsToDecimal(planned) : "",
    wants: "",
    cushionMode,
    customCushion: cushionMode === "custom" ? centsToDecimal(cushion) : "",
  };
}

// centsToDecimal on a possibly-empty string, "" → "0" (for numeric compares).
function centsToDecimalSafe(cents: string): string {
  return cents ? centsToDecimal(cents) : "0";
}

export function CategorySlider({
  open,
  onOpenChange,
  mode,
  budgetId,
  budgetCurrency,
  initial,
  month,
  cushionEnabled = true,
}: CategorySliderProps) {
  const t = useTranslations("grid");
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  // SPA refactor (260616): the grid is client-data — no RSC to router.refresh().
  // Surface a created/edited/deleted category by invalidating the exact query
  // keys the grid reads. `includeTxns` covers archive/unarchive which change a
  // column's transaction/draft visibility too; create/edit only touch the
  // category list + its planned/cushion limits (spendings-summary).
  function invalidateGrid(includeTxns: boolean) {
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "categories"] });
    qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    // A limit change can resolve/raise the CUSHION_BELOW_TARGET task server-side
    // (cushion target vs actual), so refresh the pending-tasks query → the pill
    // badge updates in the background instead of going stale until a reload.
    qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    if (includeTxns) {
      qc.invalidateQueries({ queryKey: ["transactions", budgetId] });
      qc.invalidateQueries({ queryKey: ["drafts", budgetId] });
    }
  }
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOpenRef = useRef(false);
  useEffect(() => {
    deleteOpenRef.current = deleteOpen;
  }, [deleteOpen]);

  const locale = useLocale();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      ...prefillFromInitial(initial),
      colorKey: initial?.colorKey ?? null,
    },
  });

  const { isSubmitting } = form.formState;

  // Live preview: Planned = Needs + Wants, and Cushion follows the selected
  // mode. Watched so the readouts update as the user types.
  const needsW = form.watch("needs");
  const wantsW = form.watch("wants");
  const cushionModeW = form.watch("cushionMode");
  const customW = form.watch("customCushion");
  const preview = computeSliderAmounts({
    needs: needsW,
    wants: wantsW,
    cushionMode: cushionModeW,
    custom: customW,
  });
  const plannedPreview = centsToDisplayCompact(
    preview.normalAmount,
    budgetCurrency,
    locale,
    true,
  );
  const cushionPreview = centsToDisplayCompact(
    preview.cushionAmount,
    budgetCurrency,
    locale,
    true,
  );

  // UAT Defect 3: RHF defaultValues only apply on first mount. When the slider
  // reopens (or switches category), call reset() so edit mode prefills correctly.
  useEffect(() => {
    if (open) {
      form.reset({
        name: initial?.name ?? "",
        ...prefillFromInitial(initial),
        colorKey: initial?.colorKey ?? null,
      });
    }
  }, [open, initial?.categoryId]);

  async function onSubmit(values: FormValues) {
    // SCD-2 limits are evaluated as-of the month start. EDITING writes the limit
    // for the month the grid is viewing (not always "today") so a past month can
    // be changed — the backend bounds a past-month edit to just that month and
    // carries a current-month edit forward. CREATING a new category always
    // anchors to the current month (a new category shouldn't exist only in a past
    // month). Falls back to the current month.
    const currentMonth = new Date().toISOString().slice(0, 7);
    const targetMonth =
      mode === "edit" ? (month ?? currentMonth) : currentMonth;
    const effectiveFrom = `${targetMonth}-01`;
    // Editing a PAST month changes only that month; current/future + new
    // categories carry forward (the SCD-2 default).
    const singleMonth = mode === "edit" && targetMonth < currentMonth;
    // Both modes build Planned from Needs + Wants and Cushion from the mode.
    const derived = computeSliderAmounts({
      needs: values.needs,
      wants: values.wants,
      cushionMode: values.cushionMode,
      custom: values.customCushion,
    });
    const normalAmount = derived.normalAmount;
    const cushionAmount = cushionEnabled ? derived.cushionAmount : "0";

    try {
      if (mode === "create") {
        // Step 1: POST /categories
        const createRes = await clientApiWrite(
          `/budgets/${budgetId}/categories`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: values.name,
              colorKey: values.colorKey,
            }),
          },
        );

        if (!createRes.ok) {
          toast.error(t("error.sliderSave"));
          return;
        }

        const { category } = (await createRes.json()) as {
          category: { id: string };
        };

        // Step 2: POST /categories/:id/limits
        const limitsRes = await clientApiWrite(
          `/budgets/${budgetId}/categories/${category.id}/limits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              normalAmount,
              cushionAmount,
              effectiveFrom,
            }),
          },
        );

        if (!limitsRes.ok) {
          toast.error(t("error.sliderSave"));
          return;
        }
      } else {
        // Edit flow: PATCH + POST limits (SCD-2)
        const [patchRes, limitsRes] = await Promise.all([
          clientApiWrite(
            `/budgets/${budgetId}/categories/${initial!.categoryId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: values.name,
                colorKey: values.colorKey,
              }),
            },
          ),
          clientApiWrite(
            `/budgets/${budgetId}/categories/${initial!.categoryId}/limits`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                normalAmount,
                cushionAmount,
                effectiveFrom,
                singleMonth,
              }),
            },
          ),
        ]);

        if (!patchRes.ok || !limitsRes.ok) {
          toast.error(t("error.sliderSave"));
          return;
        }
      }
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      // RHF resets isSubmitting when onSubmit settles, so no manual reset needed.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      // Non-offline throw → keep the existing generic save error.
      toast.error(t("error.sliderSave"));
      return;
    }

    onOpenChange(false);
    // Surface the new/edited category + its limits in the client-data grid.
    invalidateGrid(false);
  }

  async function handleDelete(mode: "current_future" | "all") {
    if (!initial?.categoryId) return;
    setIsDeleting(true);
    try {
      // POST /:id/archive soft-removes the category. mode "current_future" keeps
      // history (visible in past months it had activity, gone from now on); mode
      // "all" hides it everywhere. Either way transactions are kept in the DB.
      const res = await clientApiWrite(
        `/budgets/${budgetId}/categories/${initial.categoryId}/archive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );
      if (res.ok) {
        setDeleteOpen(false);
        onOpenChange(false);
        // Archive changes column + its txn/draft visibility in the grid.
        invalidateGrid(true);
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

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          // While the delete AlertDialog owns the interaction, ignore any
          // close request that bubbles up to the Sheet.
          if (!next && deleteOpenRef.current) return;
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="right"
          className="w-screen sm:w-[480px] sm:max-w-[480px] bg-[var(--surface-card-dark)] p-0 flex flex-col overflow-y-auto"
          data-testid="cat-slider-content"
          // iOS standalone PWA: Radix auto-focuses the first field on open →
          // the soft keyboard pans the layout viewport up (no browser chrome to
          // absorb it), shifting the whole sheet up and hiding the title/X.
          // Prevent autofocus; the user taps to focus.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
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
                ? t("catSlider.header.create")
                : t("catSlider.header.edit")}
            </SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col flex-1 px-6 py-4 gap-4"
              noValidate
            >
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.name")}
                    </FormLabel>
                    <FormControl>
                      <Input type="text" {...field} id="cat-slider-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Planned = Needs + Wants (both editable), in one row with the
                  short-currency total on the right. */}
              <FormItem>
                <FormLabel className="text-sm text-[var(--muted-foreground)]">
                  {t("catSlider.field.planned")}
                </FormLabel>
                <div className="flex items-center gap-2">
                  <AmountInput
                    value={needsW}
                    onChange={(v) =>
                      form.setValue("needs", v, { shouldValidate: true })
                    }
                    placeholder={t("catSlider.field.needs")}
                    className="flex-1 min-w-0"
                    id="cat-slider-needs"
                  />
                  <span
                    aria-hidden
                    className="text-[var(--muted-foreground)] shrink-0"
                  >
                    +
                  </span>
                  <AmountInput
                    value={wantsW}
                    onChange={(v) =>
                      form.setValue("wants", v, { shouldValidate: true })
                    }
                    placeholder={t("catSlider.field.wants")}
                    className="flex-1 min-w-0"
                    id="cat-slider-wants"
                  />
                  <span
                    aria-hidden
                    className="text-[var(--muted-foreground)] shrink-0"
                  >
                    =
                  </span>
                  <span
                    data-testid="cat-slider-planned-readout"
                    className="shrink-0 whitespace-nowrap text-num-sm font-semibold text-[var(--body-on-dark)]"
                  >
                    {plannedPreview}
                  </span>
                </div>
              </FormItem>

              {/* Cushion — chosen by mode, with a prominent resulting amount. */}
              {cushionEnabled && (
                <div className="flex flex-col gap-2">
                  <FormLabel className="text-sm text-[var(--muted-foreground)]">
                    {t("catSlider.field.cushion")}
                  </FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {CUSHION_MODES.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        data-testid={`cushion-mode-${m}`}
                        variant={cushionModeW === m ? "primary" : "outline"}
                        aria-pressed={cushionModeW === m}
                        onClick={() =>
                          form.setValue("cushionMode", m, {
                            shouldValidate: true,
                          })
                        }
                      >
                        {t(`catSlider.cushionMode.${m}`)}
                      </Button>
                    ))}
                  </div>
                  {cushionModeW === "custom" && (
                    <AmountInput
                      value={customW}
                      onChange={(v) =>
                        form.setValue("customCushion", v, {
                          shouldValidate: true,
                        })
                      }
                      placeholder={t("catSlider.field.cushion")}
                      className="w-full"
                      id="cat-slider-cushion-custom"
                    />
                  )}
                  {/* r32 #3: the resulting cushion was an easy-to-miss muted line;
                      now a filled row with the amount in the accent color. */}
                  <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-3 py-2">
                    <span className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.cushionResult")}
                    </span>
                    <span
                      data-testid="cat-slider-cushion-readout"
                      className="text-num-sm font-semibold text-[var(--primary)]"
                    >
                      {cushionPreview}
                    </span>
                  </div>
                </div>
              )}

              {/* Color picker (260613-v1p: icon picker removed; swatches use
                  the shared CATEGORY_COLORS map). */}
              <FormField
                control={form.control}
                name="colorKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.color")}
                    </FormLabel>
                    <div className="flex gap-2 flex-wrap">
                      {CATEGORY_COLORS.map(({ key, hex }) => (
                        <button
                          key={key}
                          type="button"
                          data-testid={`color-option-${key}`}
                          onClick={() =>
                            field.onChange(field.value === key ? null : key)
                          }
                          className={cn(
                            "flex h-8 w-8 rounded-full border-2 transition-all",
                            field.value === key
                              ? "border-[var(--body-on-dark)] scale-110"
                              : "border-transparent",
                          )}
                          style={{ backgroundColor: hex }}
                          aria-pressed={field.value === key}
                          aria-label={key}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <SheetFooter className="mt-auto pt-4 flex gap-3">
                {/* Remove button — edit mode. Categories WITH transactions can
                    be removed too (the dialog offers "keep history"). */}
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="destructive"
                    data-testid="cat-slider-delete"
                    onClick={() => setDeleteOpen(true)}
                    disabled={isSubmitting || isDeleting}
                    className="h-12 w-full sm:flex-1"
                  >
                    {t("txn.action.delete")}
                  </Button>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full sm:flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "create" ? (
                    t("catSlider.cta.create")
                  ) : (
                    t("catSlider.cta.save")
                  )}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation AlertDialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("catSlider.remove.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("catSlider.remove.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="cat-remove-keep-history"
              onClick={() => void handleDelete("current_future")}
              disabled={isDeleting}
              className="h-12 w-full justify-start text-left"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("catSlider.remove.keepHistory")
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="cat-remove-all"
              onClick={() => void handleDelete("all")}
              disabled={isDeleting}
              className="h-12 w-full justify-start text-left"
            >
              {t("catSlider.remove.everywhere")}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("confirm.deleteTxn.cancel")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
