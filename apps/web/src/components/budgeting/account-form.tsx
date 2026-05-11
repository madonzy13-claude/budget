"use client";

/**
 * account-form.tsx — RHF form for creating a new account
 * Per UI-SPEC §Accounts: name, kind, scope tabs, currency picker.
 * Generates Idempotency-Key on mount (useState initializer).
 * Submits via fetch('/api/accounts', { headers: {'Idempotency-Key': key} }).
 */
import { useState, useMemo } from "react";
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
import { CurrencyPicker } from "@/components/common/currency-picker";
import { clientApiFetch } from "@/lib/budget-fetch";

type AccountKind =
  | "CASH"
  | "CHECKING"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "LOAN"
  | "INVESTMENT";
type AccountFormValues = {
  name: string;
  kind: AccountKind;
  currency: string;
};

interface AccountFormProps {
  /** Reserved for future workspace-aware routing. Currently resolved server-side from session. */
  tenantId?: string;
  /** Reserved for future audit attribution. Currently resolved server-side from session. */
  userId?: string;
  onSuccess?: (account: { id: string; name: string }) => void;
  onCancel?: () => void;
}

const ACCOUNT_KINDS: AccountKind[] = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "LOAN",
  "INVESTMENT",
];

export function AccountForm({
  tenantId: _tenantId,
  userId: _userId,
  onSuccess,
  onCancel,
}: AccountFormProps) {
  const t = useTranslations();

  // Idempotency-Key generated once per form mount (ACCT idempotency contract)
  // crypto.randomUUID() requires secure context (HTTPS/localhost); fall back to
  // Math.random-based UUID v4 for non-secure dev environments.
  const [idempotencyKey] = useState(() => {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    // Fallback UUID v4
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
      const n = parseInt(c, 10);
      return (n ^ ((Math.random() * 16) >> (n / 4))).toString(16);
    });
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1).max(120),
        kind: z.enum([
          "CASH",
          "CHECKING",
          "SAVINGS",
          "CREDIT_CARD",
          "LOAN",
          "INVESTMENT",
        ]),
        currency: z.string().min(3).max(5),
      }),
    [],
  );

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      kind: "CASH",
      currency: "",
    },
    mode: "onBlur",
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: AccountFormValues) {
    setServerError(null);
    try {
      const res = await clientApiFetch("/wallets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(values),
      });

      if (res.status === 401) {
        // Stale / missing session — bounce to sign-in with a clear reason banner.
        const locale =
          (typeof window !== "undefined" &&
            window.location.pathname.split("/")[1]) ||
          "en";
        window.location.assign(`/${locale}/sign-in?reason=session_expired`);
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setServerError(err.error ?? "Something went wrong");
        return;
      }

      const account = (await res.json()) as { id: string; name: string };
      toast.success(`Account "${account.name}" created`);
      onSuccess?.(account);
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

        {/* Account name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.wallets.form.nameLabel")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("budgeting.wallets.form.namePlaceholder")}
                  aria-label={t("budgeting.wallets.form.nameLabel")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Account kind */}
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.wallets.form.kindLabel")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ACCOUNT_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`budgeting.wallets.kinds.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Currency picker */}
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("budgeting.wallets.form.currencyLabel")}</FormLabel>
              <FormControl>
                <CurrencyPicker
                  value={field.value}
                  onSelect={field.onChange}
                  placeholder={t("budgeting.wallets.form.currencyPlaceholder")}
                  aria-label={t("budgeting.wallets.form.currencyLabel")}
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
            {t("budgeting.wallets.form.cancelButton")}
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_85%,black)]"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("state.loading")}
              </>
            ) : (
              t("budgeting.wallets.form.saveButton")
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
