"use client";
/**
 * possessions-section.tsx — the Possessions wallet section (always on).
 *
 * Same interaction model as the spendings/reserve/cushion wallet sections:
 * inline-editable rows (name / currency / value / icon+color) plus a staged
 * draft add-row — NO sub edit sheet. Possessions ride the holdings endpoint
 * (holdingType "possession"); this section filters them out of useInvestments,
 * and the investments section filters them the other way.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useInvestments, type HoldingDto } from "@/hooks/use-investments";
import { useCreateHolding } from "@/hooks/use-create-holding";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { useArchiveHolding } from "@/hooks/use-archive-holding";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { centsToBare } from "@/lib/cents-format";
import { PossessionRow, type PossessionUpdate } from "./possession-row";

interface PossessionsSectionProps {
  budgetId: string;
  budgetCurrency: string;
}

/** Decimal string → integer-cents string, or null. */
function toCents(value: string): string | null {
  const n = Number(value.replace(/,/g, ".").replace(/\s/g, "").trim());
  if (!value.trim() || !Number.isFinite(n)) return null;
  return String(Math.round(n * 100));
}

export function PossessionsSection({
  budgetId,
  budgetCurrency,
}: PossessionsSectionProps) {
  const t = useTranslations("budget.possessions");
  const query = useInvestments(budgetId);
  const possessions = useMemo(
    () => (query.data ?? []).filter((h) => h.holdingType === "possession"),
    [query.data],
  );
  const createMut = useCreateHolding(budgetId);
  const updateMut = useUpdateHolding(budgetId);
  const archiveMut = useArchiveHolding(budgetId, {
    successMessage: t("toast.deleted"),
  });

  const [draftActive, setDraftActive] = useState(false);

  const maxAmountChars = Math.max(
    4,
    ...possessions.map((h) => centsToBare(h.currentPriceCents ?? "0").length),
  );

  async function handleUpdate(h: HoldingDto, patch: PossessionUpdate) {
    const body: Record<string, unknown> = { holdingId: h.id };
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.icon !== undefined) body.icon = patch.icon;
    if (patch.color !== undefined) body.color = patch.color;
    if (patch.amount !== undefined) {
      body.currentPriceCents = toCents(patch.amount) ?? "0";
      body.buyPriceCents = toCents(patch.amount) ?? "0";
    }
    if (patch.currency !== undefined) {
      body.currentPriceCurrency = patch.currency;
      body.buyCurrency = patch.currency;
    }
    await updateMut.mutateAsync(
      body as unknown as Parameters<typeof updateMut.mutateAsync>[0],
    );
  }

  async function handleCommitDraft(name: string) {
    await createMut.mutateAsync({
      name,
      holdingType: "possession",
      uiType: "possession",
      quantity: "1",
      currentPriceCents: "0",
      currentPriceCurrency: budgetCurrency,
      buyPriceCents: "0",
      buyCurrency: budgetCurrency,
    } as Parameters<typeof createMut.mutateAsync>[0]);
    setDraftActive(false);
  }

  return (
    <section
      data-testid="possessions-section"
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2"
    >
      <h3 className="flex items-center gap-1 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        {t("section.title")}
      </h3>

      {possessions.map((h) => (
        <PossessionRow
          key={h.id}
          mode="persisted"
          holding={h}
          maxAmountChars={maxAmountChars}
          onUpdate={(patch) => handleUpdate(h, patch)}
          onArchive={() => archiveMut.mutate(h.id)}
        />
      ))}

      {draftActive && (
        <PossessionRow
          mode="draft"
          budgetCurrency={budgetCurrency}
          maxAmountChars={maxAmountChars}
          pending={createMut.isPending}
          onCommit={handleCommitDraft}
          onDiscard={() => setDraftActive(false)}
        />
      )}

      <DashedAddButton
        onClick={() => setDraftActive(true)}
        label={t("add.cta")}
        testId="add-possession-button"
      />
    </section>
  );
}
