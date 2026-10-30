"use client";
/**
 * asset-name-combobox.tsx — asset name field with autocomplete over the type's
 * assets (13.1 D-02, D-07, UI-SPEC §3).
 *
 * Names are not unique (round-5 scope change): an asset is what you PICK, by
 * id; any typed name — even one that exists — can be added as a new asset.
 * Each option, and the picked one, shows its value + currency so twins read
 * apart. The list opens on focus, before any typing (13.1 UAT 7). A plain
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
  /** Pick-only (New transaction → Sell/Transfer): no "Add as new asset". */
  allowCreate?: boolean;
  /** Narrow the list, e.g. to assets that can be sold right now. */
  include?: (a: AssetNameDto) => boolean;
  /** The picked asset's id — its value + currency show under the field. */
  selectedId?: string | null;
  /** "Add as new asset" chosen. */
  onCreate?: () => void;
}

/** "90,200 PLN" — the value in the asset's own currency; no price → 0
 *  (round 4: no quantity — the user reads assets by what they are worth). */
function meta(a: AssetNameDto): string {
  return `${centsToBare(a.valueCents ?? "0")} ${a.valueCurrency ?? ""}`.trim();
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
  allowCreate = true,
  include,
  selectedId,
  onCreate,
}: Props) {
  const t = useTranslations("budget.investments");
  const names = (useAssetNames(budgetId, uiType).data ?? []).filter(
    (n) => n.id !== excludeId && (!include || include(n)),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const q = norm(value);
  const matches = names.filter((n) => norm(n.name).includes(q));
  const picked =
    names.find((n) => n.id === selectedId && norm(n.name) === q) ?? null;
  const options: Array<
    { kind: "asset"; a: AssetNameDto } | { kind: "create" }
  > = [
    ...matches.slice(0, MAX).map((a) => ({ kind: "asset" as const, a })),
    ...(allowCreate && q ? [{ kind: "create" as const }] : []),
  ];
  const listId = `${testId ?? "asset-name"}-list`;

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "asset") {
      onChange(o.a.name);
      onPickExisting?.(o.a);
    } else onCreate?.();
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
                if (o.kind === "create") {
                  setOpen(false);
                  onCreate?.();
                } else pick(i);
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
                  {/* Round 4: qty · value CCY, so similar names are told apart. */}
                  {
                    <span
                      data-asset-meta
                      className="ml-auto shrink-0 text-[12px] tabular-nums"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {meta(o.a)}
                    </span>
                  }
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
      {/* Round 4: picking an active asset needs no note (its Buy form shows);
          a hidden one still says it reopens (D-17). */}
      {picked?.archived ? (
        <p
          data-testid="asset-name-note"
          className="text-[12px] leading-[1.4]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {t("asset.name.reopens", { name: picked.name })}
        </p>
      ) : picked ? (
        <p
          data-testid="asset-name-picked"
          className="text-[12px] leading-[1.4] tabular-nums"
          style={{ color: "var(--muted-foreground)" }}
        >
          {meta(picked)}
        </p>
      ) : (
        allowCreate && (
          <p
            data-testid="asset-name-hint"
            className="text-[12px] leading-[1.4]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("asset.name.pickOrCreate")}
          </p>
        )
      )}
    </div>
  );
}
