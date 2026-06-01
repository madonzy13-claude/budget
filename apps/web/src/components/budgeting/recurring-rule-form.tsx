"use client";

/**
 * recurring-rule-form.tsx — Right-side slider for creating + editing
 * recurring rules. Re-aligned with the v1.1 backend contract:
 *
 *   - kind dropped (all rules produce SPENDING / expense drafts).
 *   - accountId / walletId dropped (categorical-only per TXN-02).
 *   - currency is a CurrencyPicker (free-text was a UX miss).
 *   - cadence accepts WEEKLY | MONTHLY | YEARLY, sending the
 *     discriminated `weekly_dow`, `cadence_anchor`, and
 *     `yearly_month` fields the backend expects.
 *   - Chrome matches transaction-slider so the create flow looks the
 *     same right-side drawer the user already knows from the spendings
 *     grid (Test 6 / Test 7 UAT feedback).
 *
 * The form owns its own `<Sheet>` — callers just pass `open` +
 * `onOpenChange`. This keeps the api identical to before so the two
 * existing call sites (settings/recurring-section.tsx,
 * recurring/recurring-page-client.tsx) don't need to wrap the form
 * in an outer Sheet themselves.
 *
 * Modes:
 *   - create → POST /recurring-rules
 *   - edit   → PATCH /recurring-rules/:id with applyToFuture toggle
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { formatAmountForList } from "@/components/budgeting/recurring-rules-list";
import { uuidv4 } from "@/lib/uuid";

export type RuleMode = "create" | "edit";

export type RuleCadence = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurringRuleFormValues {
  ruleId?: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  // `cadence` accepts the wider backend union (DAILY|...|YEARLY) so a row
  // pulled from the API can be handed straight to `initialValues` without
  // a narrowing cast. The form's local state coerces DAILY → MONTHLY in
  // the UI because DAILY isn't a user-selectable option here.
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  note: string | null;
  firstDueDate: string;
}

export interface RecurringRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RuleMode;
  /**
   * Active budget id — required for create. Posts hit the budget-scoped
   * route so the backend tenant guard binds the right workspace; the
   * legacy root mount needs `X-Budget-ID` separately, which we now
   * also send for parity with the rest of the chrome.
   */
  budgetId?: string;
  /**
   * Budget's default currency — used to seed the currency picker for
   * create-mode. Edit-mode keeps the rule's saved currency. Falls back
   * to "USD" when omitted (tests / dev pages).
   */
  defaultCurrency?: string;
  /**
   * Categories the rule can be attached to. When non-empty the form
   * renders a Category picker; the chosen category id rides through
   * to the API as `category_id`. Empty / omitted → no picker (the
   * /recurring legacy stub doesn't have budget context).
   */
  categories?: Array<{ id: string; name: string }>;
  initialValues?: Partial<RecurringRuleFormValues>;
  onSaved?: () => void;
  /** For test override; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * UAT round 14: Native `<input type="date">` ignores the `lang` attribute
 * in Chrome/Safari/iOS — the picker chrome uses system locale. We expose
 * a localized date picker by composing three Selects (day / month / year)
 * and reusing the already-localized `rule.months.{n}` keys. ISO YYYY-MM-DD
 * stays as the wire format so the backend contract is unchanged.
 */
function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const today = new Date();
  const parts = iso.split("-");
  const y = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  const d = parseInt(parts[2] ?? "", 10);
  return {
    y: Number.isFinite(y) ? y : today.getFullYear(),
    m: Number.isFinite(m) ? m : today.getMonth() + 1,
    d: Number.isFinite(d) ? d : today.getDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of `month + 1` → last day of `month`. JS month index is 0-based.
  return new Date(year, month, 0).getDate();
}

function composeIsoDate(year: number, month: number, day: number): string {
  const dim = daysInMonth(year, month);
  const clampedDay = Math.max(1, Math.min(dim, day));
  return `${year}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/**
 * Order weekdays appear in the WEEKLY picker. ISO/calendar convention:
 * Monday first, Sunday last (matches every paper calendar and Apple/
 * Google's `firstDayOfWeek` in en-EU/uk/pl). The underlying numeric
 * scheme matches Postgres' `weekly_dow` (Sunday=0..Saturday=6) so the
 * array maps presentation order → API value with one indirection.
 *
 * Exported for test coverage — the array IS the contract.
 */
export const WEEKDAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0];

export function RecurringRuleForm({
  open,
  onOpenChange,
  mode,
  budgetId,
  defaultCurrency,
  categories,
  initialValues,
  onSaved,
  fetchImpl,
}: RecurringRuleFormProps) {
  const t = useTranslations("budgeting.recurring");
  const queryClient = useQueryClient();

  // Normalize the prefilled amount so the input value matches the
  // shape the spendings grid uses ("1500", "123.50") instead of the
  // backend's raw 4-fractional-digit string ("1500.0000", "123.5000").
  // UAT-Phase6-Test7 retest #2: users see badly formatted amounts on
  // edit and expect grid-consistent formatting.
  const [amount, setAmount] = useState(
    initialValues?.amount ? formatAmountForList(initialValues.amount) : "",
  );
  // Create-mode seeds from the budget's default currency; edit-mode
  // keeps the rule's saved currency. "USD" is the fallback for tests
  // and the standalone /recurring stub page.
  const [currency, setCurrency] = useState(
    initialValues?.currency ?? defaultCurrency ?? "USD",
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    initialValues?.categoryId ?? null,
  );
  // Edits can only sit in WEEKLY/MONTHLY/YEARLY in the new UI. If an
  // existing rule arrived with the dropped DAILY cadence we coerce it
  // to MONTHLY so the picker has a defined value; the PATCH body never
  // sends cadence (edits-only schema), so the row keeps its DB value.
  const initialCadence: RuleCadence =
    initialValues?.cadence === "WEEKLY" ||
    initialValues?.cadence === "MONTHLY" ||
    initialValues?.cadence === "YEARLY"
      ? initialValues.cadence
      : "MONTHLY";
  const [cadence, setCadence] = useState<RuleCadence>(initialCadence);
  // UAT round 14: cadenceAnchor is a STRING in state so the day input can
  // be transiently empty while editing (user backspaces 1 → "" → types
  // 1..31). Previously `setCadenceAnchor(parseInt(e.target.value) || 1)`
  // forced the value back to 1 on every backspace, making it impossible
  // to clear the field. Submit-time parsing clamps to 1..31 with a
  // default of 1 when blank, so the wire contract is unchanged.
  const [cadenceAnchorRaw, setCadenceAnchorRaw] = useState<string>(
    String(initialValues?.cadenceAnchor ?? 1),
  );
  // Default picker selection matches WEEKDAY_ORDER[0] (Monday).
  const [weeklyDow, setWeeklyDow] = useState<number>(
    initialValues?.weeklyDow ?? WEEKDAY_ORDER[0]!,
  );
  const [yearlyMonth, setYearlyMonth] = useState<number>(
    initialValues?.yearlyMonth ?? 1,
  );
  const [firstDueDate, setFirstDueDate] = useState(
    initialValues?.firstDueDate ?? todayIso(),
  );
  const [note, setNote] = useState(initialValues?.note ?? "");
  // applyToFuture is permanently true — UAT-Phase6-Test7 retest: the
  // user always wants edits to flow to upcoming drafts; the explicit
  // checkbox was treated as noise and intentionally removed from the
  // UI. PATCH body still carries `applyToFuture: true` for backend
  // compatibility.
  const applyToFuture = true;
  const [saving, setSaving] = useState(false);

  const doFetch = fetchImpl ?? fetch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // UAT round 14: parse the string-state cadence anchor at submit
      // time. Empty / non-numeric → 1. Otherwise clamp to 1..31.
      const parsedAnchor = parseInt(cadenceAnchorRaw, 10);
      const cadenceAnchor = Number.isFinite(parsedAnchor)
        ? Math.max(1, Math.min(31, parsedAnchor))
        : 1;
      if (mode === "create") {
        // Backend v1.1 contract: snake_case + cadence-discriminated body.
        // Plain object first, then spread the cadence discriminator into
        // a single payload to keep the union typesafe across branches.
        const cadencePart: Record<string, unknown> =
          cadence === "WEEKLY"
            ? { cadence: "WEEKLY", weekly_dow: weeklyDow }
            : cadence === "MONTHLY"
              ? { cadence: "MONTHLY", cadence_anchor: cadenceAnchor }
              : {
                  cadence: "YEARLY",
                  yearly_month: yearlyMonth,
                  cadence_anchor: cadenceAnchor,
                };
        // Post to the budget-scoped path so requireWorkspace resolves
        // tenancy from the URL segment; fall back to the legacy root
        // mount + X-Budget-ID header when the caller did not pass an id.
        const url = budgetId
          ? `/api/budgets/${budgetId}/recurring-rules`
          : "/api/recurring-rules";
        const res = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": uuidv4(),
            ...(budgetId ? { "X-Budget-ID": budgetId } : {}),
          },
          body: JSON.stringify({
            amount,
            currency,
            category_id: categoryId,
            note: note || null,
            first_due_date: firstDueDate,
            ...cadencePart,
          }),
        });
        if (!res.ok) {
          toast.error(t("errors.create"));
          return;
        }
        // UAT round 11: creating a rule with first_due_date <= today
        // synchronously materialises the first draft + emits CONFIRM_DRAFT
        // server-side (create-recurring-rule.ts catch-up loop, commit
        // 4480afc). Invalidate the per-budget tasks query so the Spendings
        // pill badge + slider show the new task within ~1 tick instead of
        // waiting for the 60 s React Query poll.
        if (budgetId) {
          queryClient.invalidateQueries({
            queryKey: ["tasks", budgetId, "pending"],
          });
        }
      } else {
        const ruleId = initialValues?.ruleId;
        if (!ruleId) return;
        const editUrl = budgetId
          ? `/api/budgets/${budgetId}/recurring-rules/${ruleId}`
          : `/api/recurring-rules/${ruleId}`;
        const res = await doFetch(editUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": uuidv4(),
            ...(budgetId ? { "X-Budget-ID": budgetId } : {}),
          },
          body: JSON.stringify({
            edits: {
              amount,
              currency,
              categoryId,
              note: note || null,
            },
            applyToFuture,
          }),
        });
        if (!res.ok) {
          toast.error(t("errors.update"));
          return;
        }
        // UAT round 11: editing a rule can change the next-due materialise
        // path; refresh the tasks query for the same reason as the create
        // branch above.
        if (budgetId) {
          queryClient.invalidateQueries({
            queryKey: ["tasks", budgetId, "pending"],
          });
        }
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-[var(--hairline-dark)]">
          <SheetTitle>
            {mode === "create" ? t("rule.title") : t("rule.editTitle")}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {/* Amount + currency share a row, mirroring the transaction
                slider's amount-and-currency line. */}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <Label htmlFor="rr-amount">{t("rule.amountLabel")}</Label>
                <Input
                  id="rr-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="w-32">
                <Label>{t("rule.currencyLabel")}</Label>
                <CurrencyPicker
                  value={currency}
                  onSelect={setCurrency}
                  variant="field"
                />
              </div>
            </div>

            {/* Category picker — mandatory. The form blocks Save until
                a category is chosen so the draft has a column to land
                in (UAT-Phase6-Test7 retest). Empty state renders an
                un-selectable placeholder via the Radix `value` prop
                left unset; once the user picks a value, the Save button
                un-disables (see the disabled prop on the submit button). */}
            {categories && categories.length > 0 && (
              <div>
                <Label htmlFor="rr-category">{t("rule.categoryLabel")}</Label>
                <Select
                  // UAT round 13: keep value undefined when categoryId is
                  // null so the trigger shows the *placeholder* rather than
                  // resolving to a category label. Radix only renders the
                  // SelectValue placeholder when `value` is undefined.
                  value={categoryId ?? undefined}
                  onValueChange={(v) => setCategoryId(v)}
                >
                  <SelectTrigger id="rr-category">
                    <SelectValue placeholder={t("rule.categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cadence + anchor + first-due fields render in both
                create AND edit modes (UAT-Phase6-Test7 retest: edit
                used to hide everything below the amount/currency row).
                Edit reuses the same state — the PATCH body still only
                sends amount/currency/note + applyToFuture per the v1.1
                contract, so changing cadence here is purely informational
                until the backend exposes cadence on PATCH. */}
            <>
              {/* Cadence picker: weekly / monthly / yearly tiles.
                    The transfer/income kind toggle was dropped — all
                    rules are expenses. */}
              <div>
                <Label>{t("rule.cadenceLabel")}</Label>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant={cadence === "WEEKLY" ? "primary" : "outline"}
                    onClick={() => setCadence("WEEKLY")}
                    className="flex-1"
                  >
                    {t("rule.weekly")}
                  </Button>
                  <Button
                    type="button"
                    variant={cadence === "MONTHLY" ? "primary" : "outline"}
                    onClick={() => setCadence("MONTHLY")}
                    className="flex-1"
                  >
                    {t("rule.monthly")}
                  </Button>
                  <Button
                    type="button"
                    variant={cadence === "YEARLY" ? "primary" : "outline"}
                    onClick={() => setCadence("YEARLY")}
                    className="flex-1"
                  >
                    {t("rule.yearly")}
                  </Button>
                </div>
              </div>

              {cadence === "WEEKLY" && (
                <div>
                  <Label htmlFor="rr-dow">{t("rule.weekdayLabel")}</Label>
                  <Select
                    value={String(weeklyDow)}
                    onValueChange={(v) => setWeeklyDow(parseInt(v, 10))}
                  >
                    <SelectTrigger id="rr-dow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_ORDER.map((dow) => (
                        <SelectItem key={dow} value={String(dow)}>
                          {t(`rule.weekdays.${dow}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cadence === "MONTHLY" && (
                <div>
                  <Label htmlFor="rr-anchor">{t("rule.anchorDayLabel")}</Label>
                  <Input
                    id="rr-anchor"
                    type="number"
                    min={1}
                    max={31}
                    value={cadenceAnchorRaw}
                    onChange={(e) => setCadenceAnchorRaw(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(cadenceAnchorRaw, 10);
                      const clamped = Number.isFinite(n)
                        ? Math.max(1, Math.min(31, n))
                        : 1;
                      setCadenceAnchorRaw(String(clamped));
                    }}
                  />
                </div>
              )}

              {cadence === "YEARLY" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="rr-yearly-month">
                      {t("rule.yearlyMonthLabel")}
                    </Label>
                    <Select
                      value={String(yearlyMonth)}
                      onValueChange={(v) => setYearlyMonth(parseInt(v, 10))}
                    >
                      <SelectTrigger id="rr-yearly-month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {t(`rule.months.${m}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="rr-yearly-day">
                      {t("rule.anchorDayLabel")}
                    </Label>
                    <Input
                      id="rr-yearly-day"
                      type="number"
                      min={1}
                      max={31}
                      value={cadenceAnchorRaw}
                      onChange={(e) => setCadenceAnchorRaw(e.target.value)}
                      onBlur={() => {
                        const n = parseInt(cadenceAnchorRaw, 10);
                        const clamped = Number.isFinite(n)
                          ? Math.max(1, Math.min(31, n))
                          : 1;
                        setCadenceAnchorRaw(String(clamped));
                      }}
                    />
                  </div>
                </div>
              )}

              {/* UAT round 14: native `<input type="date">` ignores the
                  `lang` attribute on Chrome/Safari/iOS — the picker chrome
                  always renders month names in the browser's system locale.
                  Replaced with three Selects (day / month / year) that
                  reuse the already-localized `rule.months.{n}` keys, so
                  uk/pl users see "Січень / Styczeń" instead of "January".
                  Day count derives from the chosen month so February
                  caps at 28/29. ISO YYYY-MM-DD stays as the wire format
                  (parsed/composed via helpers at the top of this file). */}
              <div>
                <Label>{t("rule.firstDueLabel")}</Label>
                {(() => {
                  const parts = parseIsoDate(firstDueDate);
                  const dim = daysInMonth(parts.y, parts.m);
                  const currentYear = new Date().getFullYear();
                  const yearOptions = Array.from(
                    { length: 16 },
                    (_, i) => currentYear - 5 + i,
                  );
                  return (
                    <div className="grid grid-cols-[2fr_3fr_2fr] gap-2 pt-1">
                      <Select
                        value={String(parts.d)}
                        onValueChange={(v) =>
                          setFirstDueDate(
                            composeIsoDate(parts.y, parts.m, parseInt(v, 10)),
                          )
                        }
                      >
                        <SelectTrigger id="rr-firstdue-day">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: dim }, (_, i) => i + 1).map(
                            (d) => (
                              <SelectItem key={d} value={String(d)}>
                                {d}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(parts.m)}
                        onValueChange={(v) =>
                          setFirstDueDate(
                            composeIsoDate(parts.y, parseInt(v, 10), parts.d),
                          )
                        }
                      >
                        <SelectTrigger id="rr-firstdue-month">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {t(`rule.months.${m}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(parts.y)}
                        onValueChange={(v) =>
                          setFirstDueDate(
                            composeIsoDate(parseInt(v, 10), parts.m, parts.d),
                          )
                        }
                      >
                        <SelectTrigger id="rr-firstdue-year">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {yearOptions.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>
            </>

            <div>
              <Label htmlFor="rr-note">{t("rule.noteLabel")}</Label>
              <Input
                id="rr-note"
                type="text"
                value={note ?? ""}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* `Also apply to future occurrences` checkbox removed per
                UAT-Phase6-Test7 retest — it's always true. */}
          </div>

          <SheetFooter className="px-6 py-4 mt-auto pt-4 flex gap-3 border-t border-[var(--hairline-dark)]">
            {/* `h-14 text-base` per UAT-Phase6-Test7 retest #2 — the
                h-12 height matched transaction-slider exactly but the
                user wanted a chunkier tap target on iPhone (48 → 56px).
                The transaction-slider was bumped in lockstep so both
                sliders still feel identical on mobile. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-14 text-base w-full sm:flex-1"
            >
              {t("rule.cancelButton")}
            </Button>
            <Button
              type="submit"
              disabled={
                saving || (categories && categories.length > 0 && !categoryId)
              }
              className="h-14 text-base w-full sm:flex-1 bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("rule.saveButton")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
