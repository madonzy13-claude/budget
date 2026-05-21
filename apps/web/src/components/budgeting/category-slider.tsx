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
import {
  Loader2,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Heart,
  Briefcase,
  Music,
  BookOpen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
import { clientApiFetch } from "@/lib/budget-fetch";
import { cn } from "@/lib/utils";

const PRESET_ICONS = [
  { key: "shopping-cart", Icon: ShoppingCart },
  { key: "home", Icon: Home },
  { key: "car", Icon: Car },
  { key: "utensils", Icon: Utensils },
  { key: "heart", Icon: Heart },
  { key: "briefcase", Icon: Briefcase },
  { key: "music", Icon: Music },
  { key: "book-open", Icon: BookOpen },
] as const;

const PRESET_COLORS = [
  { key: "yellow", hex: "#F0B90B" },
  { key: "green", hex: "#26A69A" },
  { key: "blue", hex: "#4A90D9" },
  { key: "red", hex: "#EF5350" },
  { key: "orange", hex: "#FF8F00" },
  { key: "purple", hex: "#7C4DFF" },
  { key: "pink", hex: "#EC407A" },
  { key: "gray", hex: "#78909C" },
] as const;

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
    iconKey: string | null;
    colorKey: string | null;
  };
  txnsCount?: number;
}

// plannedCents/cushionCents hold the raw decimal-string input ("60", "60.00")
// — decimalToCents() converts to integer cents at submit. The regex must accept
// the decimal form: edit mode prefills these via centsToDecimal ("60.00"), and
// an integer-only regex would silently block zodResolver / handleSubmit.
const amountField = z.string().regex(/^\d+(\.\d{1,2})?$/);

const schema = z.object({
  name: z.string().min(1).max(60),
  plannedCents: amountField,
  cushionCents: amountField,
  iconKey: z.string().nullable(),
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

// Returns a digit string — setLimitSchema validates normalAmount/cushionAmount
// as z.string().regex(/^\d+$/) (bigint cents over the wire). Sending a number
// fails validation with a 422.
function decimalToCents(decimal: string): string {
  return String(Math.round(parseFloat(decimal) * 100));
}

export function CategorySlider({
  open,
  onOpenChange,
  mode,
  budgetId,
  budgetCurrency,
  initial,
  txnsCount = 0,
}: CategorySliderProps) {
  const t = useTranslations("grid");
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOpenRef = useRef(false);
  useEffect(() => {
    deleteOpenRef.current = deleteOpen;
  }, [deleteOpen]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      plannedCents: initial?.plannedCents
        ? centsToDecimal(initial.plannedCents)
        : "0",
      cushionCents: initial?.cushionCents
        ? centsToDecimal(initial.cushionCents)
        : "0",
      iconKey: initial?.iconKey ?? null,
      colorKey: initial?.colorKey ?? null,
    },
  });

  const { isSubmitting } = form.formState;

  // UAT Defect 3: RHF defaultValues only apply on first mount. When the slider
  // reopens (or switches category), call reset() so edit mode prefills correctly.
  useEffect(() => {
    if (open) {
      form.reset({
        name: initial?.name ?? "",
        plannedCents: initial?.plannedCents
          ? centsToDecimal(initial.plannedCents)
          : "0",
        cushionCents: initial?.cushionCents
          ? centsToDecimal(initial.cushionCents)
          : "0",
        iconKey: initial?.iconKey ?? null,
        colorKey: initial?.colorKey ?? null,
      });
    }
  }, [open, initial?.categoryId]);

  async function onSubmit(values: FormValues) {
    // SCD-2 limits are evaluated as-of the month start by spendings-summary —
    // a mid-month effectiveFrom would leave the new limit invisible for the
    // current month. Anchor to the first of the current month.
    const effectiveFrom = `${new Date().toISOString().slice(0, 7)}-01`;
    const normalAmount = decimalToCents(values.plannedCents);
    const cushionAmount = decimalToCents(values.cushionCents);

    if (mode === "create") {
      // Step 1: POST /categories
      const createRes = await clientApiFetch(
        `/budgets/${budgetId}/categories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            iconKey: values.iconKey,
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
      const limitsRes = await clientApiFetch(
        `/budgets/${budgetId}/categories/${category.id}/limits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ normalAmount, cushionAmount, effectiveFrom }),
        },
      );

      if (!limitsRes.ok) {
        toast.error(t("error.sliderSave"));
        return;
      }
    } else {
      // Edit flow: PATCH + POST limits (SCD-2)
      const [patchRes, limitsRes] = await Promise.all([
        clientApiFetch(
          `/budgets/${budgetId}/categories/${initial!.categoryId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: values.name,
              iconKey: values.iconKey,
              colorKey: values.colorKey,
            }),
          },
        ),
        clientApiFetch(
          `/budgets/${budgetId}/categories/${initial!.categoryId}/limits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              normalAmount,
              cushionAmount,
              effectiveFrom,
            }),
          },
        ),
      ]);

      if (!patchRes.ok || !limitsRes.ok) {
        toast.error(t("error.sliderSave"));
        return;
      }
    }

    onOpenChange(false);
    // Re-run the RSC fetch so the grid reflects the new/edited category.
    router.refresh();
  }

  async function handleDelete() {
    if (!initial?.categoryId) return;
    setIsDeleting(true);
    try {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/categories/${initial.categoryId}`,
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

              {/* Planned monthly */}
              <FormField
                control={form.control}
                name="plannedCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.planned")}
                    </FormLabel>
                    <div className="flex gap-2 items-center">
                      <FormControl>
                        <AmountInput
                          value={field.value}
                          onChange={field.onChange}
                          aria-invalid={!!form.formState.errors.plannedCents}
                          id="cat-slider-planned"
                        />
                      </FormControl>
                      <span
                        data-testid="currency-badge"
                        className="text-sm font-medium text-[var(--primary)] px-2 py-1 rounded bg-[var(--surface-elevated-dark)]"
                      >
                        {budgetCurrency}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cushion monthly */}
              <FormField
                control={form.control}
                name="cushionCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.cushion")}
                    </FormLabel>
                    <div className="flex gap-2 items-center">
                      <FormControl>
                        <AmountInput
                          value={field.value}
                          onChange={field.onChange}
                          aria-invalid={!!form.formState.errors.cushionCents}
                          id="cat-slider-cushion"
                        />
                      </FormControl>
                      <span
                        data-testid="currency-badge"
                        className="text-sm font-medium text-[var(--primary)] px-2 py-1 rounded bg-[var(--surface-elevated-dark)]"
                      >
                        {budgetCurrency}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Icon picker */}
              <FormField
                control={form.control}
                name="iconKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.icon")}
                    </FormLabel>
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_ICONS.map(({ key, Icon }) => (
                        <button
                          key={key}
                          type="button"
                          data-testid={`icon-option-${key}`}
                          onClick={() =>
                            field.onChange(field.value === key ? null : key)
                          }
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
                            field.value === key
                              ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                              : "border-[var(--border)] bg-[var(--surface-elevated-dark)] text-[var(--muted-foreground)] hover:border-[var(--primary)]",
                          )}
                          aria-pressed={field.value === key}
                        >
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              {/* Color picker */}
              <FormField
                control={form.control}
                name="colorKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-[var(--muted-foreground)]">
                      {t("catSlider.field.color")}
                    </FormLabel>
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_COLORS.map(({ key, hex }) => (
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
                {/* Delete button — edit mode, only if txnsCount === 0 */}
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="destructive"
                    data-testid="cat-slider-delete"
                    onClick={() => setDeleteOpen(true)}
                    disabled={isSubmitting || isDeleting || txnsCount > 0}
                    aria-disabled={txnsCount > 0 ? "true" : undefined}
                    title={
                      txnsCount > 0
                        ? "Cannot delete category with existing transactions"
                        : undefined
                    }
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
            <AlertDialogTitle>{t("confirm.deleteTxn.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category.
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
