"use client";
/**
 * asset-name-combobox.tsx — asset name field with autocomplete over the type's
 * assets (13.1 D-02, D-07, UI-SPEC §3).
 *
 * Same name (trimmed, case-insensitive) = the same asset: picking one joins it
 * (a hidden, sold-out one reopens). The list opens on focus, before any
 * typing (13.1 UAT 7); a new name always ends it with "Add as new asset". A plain
 * ARIA combobox + listbox rather than Popover/Command: the list sits inline
 * under the input inside the sheet, so there is no portal to fight.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { centsToBare } from "@/lib/cents-format";
import { useAssetNames, type AssetNameDto } from "@/hooks/use-asset-names";

const MAX = 6;

/** Sheet `onEscapeKeyDown`: Radix handles Escape in the capture phase, before
 *  the combobox can stop it — keep the sheet open while a list is showing so
 *  Escape closes only the list (UI-SPEC §3). */
export function keepSheetOnListEscape(e: KeyboardEvent): void {
  const t = (
    e.target instanceof Element ? e.target : document.activeElement
  ) as Element | null;
  if (
    t?.getAttribute("role") === "combobox" &&
    t.getAttribute("aria-expanded") === "true"
  )
    e.preventDefault();
}
const norm = (s: string) => s.trim().toLowerCase();

interface Props {
  budgetId: string;
  uiType: string | null;
  value: string;
  onChange: (name: string) => void;
  onPickExisting?: (a: AssetNameDto) => void;
  /** Hide the given asset (e.g. the source asset of a transfer). */
  excludeId?: string;
  testId?: string;
  ariaLabel?: string;
  invalid?: boolean;
}

export function AssetNameCombobox({
  budgetId,
  uiType,
  value,
  onChange,
  onPickExisting,
  excludeId,
  testId,
  ariaLabel,
  invalid,
}: Props) {
  const t = useTranslations("budget.investments");
  const names = (useAssetNames(budgetId, uiType).data ?? []).filter(
    (n) => n.id !== excludeId,
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const q = norm(value);
  const matches = names.filter((n) => norm(n.name).includes(q));
  const exact = names.find((n) => norm(n.name) === q) ?? null;
  const options: Array<
    { kind: "asset"; a: AssetNameDto } | { kind: "create" }
  > = [
    ...matches.slice(0, MAX).map((a) => ({ kind: "asset" as const, a })),
    ...(q && !exact ? [{ kind: "create" as const }] : []),
  ];
  const listId = `${testId ?? "asset-name"}-list`;

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "asset") {
      onChange(o.a.name);
      onPickExisting?.(o.a);
    }
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-label={ariaLabel ?? t("asset.name.label")}
        aria-invalid={invalid || undefined}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        data-testid={testId}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && active >= 0) {
            e.preventDefault();
            pick(active);
          } else if (e.key === "Escape" && open) {
            // Close the list, not the sheet.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="max-h-[264px] overflow-y-auto rounded-[var(--radius-md)] border"
          style={{
            background: "var(--surface-card-dark)",
            borderColor: "var(--hairline-dark)",
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.kind === "asset" ? o.a.id : "create"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-testid={
                o.kind === "create"
                  ? "asset-name-create"
                  : `asset-name-option-${i}`
              }
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                if (o.kind === "create") setOpen(false);
                else pick(i);
              }}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-[14px]"
              style={{
                color: "var(--body-on-dark)",
                background:
                  i === active ? "var(--surface-elevated-dark)" : undefined,
              }}
            >
              {o.kind === "asset" ? (
                <>
                  <span className="min-w-0 break-words">{o.a.name}</span>
                  {o.a.archived && (
                    <span
                      className="shrink-0 text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {t("asset.name.closed")}
                    </span>
                  )}
                </>
              ) : (
                t("asset.name.create", { name: value.trim() })
              )}
            </li>
          ))}
        </ul>
      )}
      {exact && (
        <p
          data-testid="asset-name-note"
          className="text-[12px] leading-[1.4]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {exact.archived
            ? t("asset.name.reopens", { name: exact.name })
            : t("asset.name.joins", {
                name: exact.name,
                value:
                  `${centsToBare(exact.valueCents ?? "0")} ${exact.valueCurrency ?? ""}`.trim(),
              })}
        </p>
      )}
    </div>
  );
}
