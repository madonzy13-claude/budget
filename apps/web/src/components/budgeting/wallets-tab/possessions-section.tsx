"use client";
/**
 * possessions-section.tsx — the Possessions wallet section (always on).
 *
 * Renders after the investments section. Possessions share the holdings endpoint
 * (holdingType "possession") so this filters them out of useInvestments and the
 * investments section filters them the other way. Simple list + add; no DnD,
 * groups or reorder (possessions don't need them).
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useInvestments, type HoldingDto } from "@/hooks/use-investments";
import { useArchiveHolding } from "@/hooks/use-archive-holding";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { PossessionRow } from "./possession-row";
import { PossessionSheet } from "./possession-sheet";

interface PossessionsSectionProps {
  budgetId: string;
  budgetCurrency: string;
}

export function PossessionsSection({
  budgetId,
  budgetCurrency,
}: PossessionsSectionProps) {
  const t = useTranslations("budget.possessions");
  const query = useInvestments(budgetId);
  const possessions = useMemo(
    () =>
      (query.data ?? []).filter((h) => h.holdingType === "possession"),
    [query.data],
  );
  const archiveMut = useArchiveHolding(budgetId);

  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    holding: HoldingDto | null;
  }>({ open: false, mode: "create", holding: null });

  const openAdd = () =>
    setSheet({ open: true, mode: "create", holding: null });
  const openEdit = (holding: HoldingDto) =>
    setSheet({ open: true, mode: "edit", holding });

  return (
    <section
      data-testid="possessions-section"
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2"
    >
      <h3 className="flex items-center gap-1 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        {t("section.title")}
      </h3>

      <div className="flex flex-col gap-2">
        {possessions.map((h) => (
          <PossessionRow
            key={h.id}
            holding={h}
            onEdit={() => openEdit(h)}
            onDelete={() => archiveMut.mutate(h.id)}
          />
        ))}
      </div>

      <DashedAddButton
        onClick={openAdd}
        label={t("add.cta")}
        testId="add-possession-button"
      />

      <PossessionSheet
        key={`${sheet.mode}-${sheet.holding?.id ?? "new"}-${sheet.open}`}
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        mode={sheet.mode}
        budgetId={budgetId}
        budgetCurrency={budgetCurrency}
        holding={sheet.holding}
      />
    </section>
  );
}
