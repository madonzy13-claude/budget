"use client";

/**
 * transaction-edit-form.tsx — Edit form for correction-row path (plan 02-07, EXPN-06).
 *
 * Pre-fills from the original transaction; submits to POST /api/transactions/:id/correct.
 * Disabled fields: kind (immutable post-creation), currencyDefault, transferGroupId for transfer legs.
 * Generates a fresh Idempotency-Key per form mount.
 * On 409 AlreadyCorrected → inline error message (do not close; user must reload).
 */
import { useState } from "react";
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
import { clientApiFetch } from "@/lib/budget-fetch";

interface ChainRow {
  id: string;
  kind: string;
  amountOrig: string;
  currencyOrig: string;
  amountDefault: string;
  currencyDefault: string;
  fxRate: string;
  fxRateDate: string;
  fxProvider: string;
  transactionDate: string;
  note: string | null;
  accountId: string;
  categoryId: string | null;
  transferGroupId: string | null;
  correctsId: string | null;
}

export interface TransactionEditFormProps {
  transaction: ChainRow;
  onSuccess?: (result: { correctionId: string }) => void;
  onCancel?: () => void;
}

const editFormSchema = z.object({
  amountOrig: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive number")
    .refine((v) => parseFloat(v) > 0, "Amount must be greater than 0"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  note: z.string().max(500).optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

// generateIdempotencyKey extracted to @/lib/idempotency (Plan 04-01, D-PH4-S2).
// This form is scheduled for deletion in Plan 04-04.
import { generateIdempotencyKey } from "@/lib/idempotency";

export function TransactionEditForm({
  transaction,
  onSuccess,
  onCancel,
}: TransactionEditFormProps) {
  const t = useTranslations("budgeting");
  const [idempotencyKey] = useState(() => generateIdempotencyKey());
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      amountOrig: transaction.amountOrig,
      transactionDate: transaction.transactionDate,
      note: transaction.note ?? "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: EditFormValues) {
    setServerError(null);

    const edits: Record<string, unknown> = {};
    if (values.amountOrig !== transaction.amountOrig) {
      edits.amountOrig = values.amountOrig;
      // amountDefault re-computed on server if amount changed
    }
    if (values.transactionDate !== transaction.transactionDate) {
      edits.transactionDate = values.transactionDate;
    }
    const noteValue = values.note ?? "";
    if (noteValue !== (transaction.note ?? "")) {
      edits.note = noteValue || null;
    }

    if (Object.keys(edits).length === 0) {
      // No changes
      onCancel?.();
      return;
    }

    try {
      const res = await clientApiFetch(
        `/transactions/${transaction.id}/correct`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ edits }),
        },
      );

      if (res.status === 409) {
        const data = (await res.json()) as { error: string };
        if (data.error === "already_corrected") {
          setServerError(t("transactions.edit.alreadyCorrected"));
          return;
        }
        setServerError(t("transactions.edit.alreadyCorrected"));
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setServerError(err.error ?? "Something went wrong");
        return;
      }

      const result = (await res.json()) as { correctionId: string };
      toast.success(t("transactions.edit.saveButton"));
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

        {/* Kind — immutable, shown as disabled text with hint */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--muted-foreground)]">
            Kind
          </label>
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 bg-[var(--surface-elevated-dark)] opacity-60">
            <span className="text-sm text-[var(--body)]">
              {transaction.kind.charAt(0) +
                transaction.kind.slice(1).toLowerCase()}
            </span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("transactions.edit.kindFieldHint")}
          </p>
        </div>

        {/* Amount */}
        <FormField
          control={form.control}
          name="amountOrig"
          render={({ field }) => (
            <FormItem>
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

        {/* Date */}
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
            {t("transactions.edit.cancelButton")}
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
            disabled={isSubmitting}
            data-testid="edit-submit-button"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("transactions.edit.saveButton")
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
