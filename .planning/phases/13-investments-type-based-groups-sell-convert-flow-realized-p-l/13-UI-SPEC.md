---
phase: 13
slug: investments-type-based-groups-sell-convert-flow-realized-p-l
status: approved
reviewed_at: 2026-10-25
shadcn_initialized: true
preset: project-local (new-york / zinc / lucide; DESIGN.md is source of truth)
created: 2026-10-25
---

# Phase 13 — UI Design Contract: Investments type groups, Sell/Withdraw flow, History

> Visual and interaction contract. DESIGN.md (Binance dark, single yellow accent) is the source of truth. This file only resolves Phase 13 decisions (D-01..D-19). Reuse existing components; do not reinvent.

---

## Design System

| Property          | Value                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Tool              | shadcn (initialized, `apps/web/components.json`, new-york, cssVariables)                 |
| Preset            | project-local theme (Binance dark canvas, `--surface-*` tokens)                          |
| Component library | Radix (shadcn Sheet, AlertDialog, Popover, Collapsible)                                  |
| Icon library      | lucide-react (already used: TrendingUp, TrendingDown, Trash2, GripVertical, ChevronDown) |
| Font              | BinanceNova (labels/copy), BinancePlex (every money amount and %)                        |

Existing UI to reuse (all in `apps/web/src/components/budgeting/wallets-tab/`):

| Need              | Reuse                                                                         | Change                                                                                 |
| ----------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sell sheet        | `holding-sheet.tsx` shell (shadcn `<Sheet>`, same header/footer/field styles) | New `sell-sheet.tsx` composes the same Sheet + type-specific form for "New investment" |
| Row swipe actions | `investment-row-sheet.tsx` (swipe panel, iOS `touch-pan-x`)                   | Actions become Sell / Edit / Delete (add Sell, order below)                            |
| Type header       | `investment-group-header.tsx`                                                 | Replace with `investment-type-header.tsx` (type-keyed, realized sub-line)              |
| Delete confirm    | `holding-delete-confirm.tsx` (AlertDialog)                                    | New copy (history erased)                                                              |
| Group combobox    | `group-combobox.tsx`                                                          | DELETE; remove "Group" field from `holding-sheet.tsx`                                  |
| Edit sheet        | `holding-sheet.tsx`                                                           | Add "What happened?" step + History section                                            |

---

## Focal Points

- Sell sheet: the "Row after sale" preview card (24/600 figure) is the focal point.
- Type header: the value figure (16/600, BinancePlex) is the focal point.

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage                                                     |
| ----- | ----- | --------------------------------------------------------- |
| xs    | 4px   | Icon gaps, header sub-line gap, history row inner gap     |
| sm    | 8px   | Compact spacing, chip gaps, radio-card gap                |
| md    | 16px  | Sheet field gap, sheet horizontal padding, header padding |
| lg    | 24px  | Sheet section gap (steps, History section top margin)     |
| xl    | 32px  | Sheet bottom safe-area padding                            |
| 2xl   | 48px  | Not used this phase                                       |
| 3xl   | 64px  | Not used this phase                                       |

Exceptions: touch targets (swipe action buttons, destination radio-cards, history delete button, drag handle) are min 44x44px. Header row height min 56px (two-line: value+P/L, realized sub-line).

---

## Typography

Exactly 4 sizes, 2 weights (400 regular, 600 semibold). Numbers use BinancePlex at the same size/weight.

| Role                                                                                        | Size | Weight | Line Height |
| ------------------------------------------------------------------------------------------- | ---- | ------ | ----------- |
| Body (fields, history rows, option descriptions)                                            | 14px | 400    | 1.5         |
| Label / caption (realized sub-line, field labels, history dates, helper text)               | 12px | 400    | 1.4         |
| Heading (sheet title, step title "Where did the money go?", type header name, header value) | 16px | 600    | 1.4         |
| Display (live "Row after sale" preview figure only)                                         | 24px | 600    | 1.2         |

Existing `text-num-sm` / `text-caption` classes may carry weight 500 for numbers today; new Phase 13 elements use 400/600 only. Do not introduce other sizes.

---

## Color

| Role            | Value                                                                       | Usage                                                                                     |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dominant (60%)  | `var(--canvas-dark)` #0b0e11                                                | Page, sheet backdrop                                                                      |
| Secondary (30%) | `var(--surface-card-dark)` #1e2329 / `var(--surface-elevated-dark)` #2b3139 | Type header band, sheet body, radio-cards, history rows (hairline `var(--hairline-dark)`) |
| Accent (10%)    | `var(--primary)` #fcd535                                                    | See reserved list                                                                         |
| P/L positive    | `var(--trading-up)`                                                         | TEXT only                                                                                 |
| P/L negative    | `var(--trading-down)`                                                       | TEXT only                                                                                 |
| Destructive     | `var(--trading-down)`                                                       | Delete-entry / Delete-holding confirm button text + swipe Delete only                     |

Accent reserved for (exhaustive):

1. Primary submit button in Sell sheet ("Record sale" / "Record withdrawal") and in the edit "What happened?" step ("Save new value" / "Record added money" / "Record withdrawal").
2. Selected state border of the destination radio-card (New / Existing / Out of investments) and of the "What happened?" choice.
3. Drop indicator line while dragging a type group block.

Rules:

- Realized and total P/L always TEXT colored via inline `style={{ color: "var(--trading-up|down)" }}` (tailwind-merge drops `text-[var()]`); neutral/zero = `var(--muted-strong)`. Verify computed colour in light AND dark theme.
- Never hardcode hex; use `--surface-*` tokens (light theme breaks otherwise).
- Never use trading-up/down as background fills; sell button is NOT red (Sell is the primary yellow submit; red is reserved for destructive).
- The swipe "Sell" action uses `var(--surface-elevated-dark)` bg with `var(--body-on-dark)` icon (not green/red).

---

## Layout and Interaction

### 1. Type groups (D-10..D-16)

- Investments list = ordered blocks. Each block: `InvestmentTypeHeader` + its holdings (within-type sortable). Only types with >=1 held (non-archived) holding render (D-13, D-14).
- 11 type keys, display order default = `UI_TYPE_ORDER`; saved order overrides (D-12). Type label = existing i18n type names (stocks label "Stocks & ETFs").
- Header, left to right: drag handle (44px target, GripVertical, `touch-action: none` on handle only) · collapse chevron · type name (16/600) · right column: value (16/600, BinancePlex) over total P/L amount + % (14/400, colored). Under the name block, full width sub-line (12/400, muted): `incl. realized +28k` — rendered ONLY when realized != 0. Realized figure colored by sign; the words stay muted.
- P/L % = total P/L / lifetime cost (D-16); show `—` ONLY when lifetime cost is 0 (never for a normal type).
- Mobile tap on header value area (existing tap sum-up popover) shows split: Unrealized / Realized / Total P/L / Lifetime return.
- Holding drag: same single flat SortableContext rule (INVESTMENTS-DND.md) but items constrained to own type; no cross-type drop target; remove join-band geometry. Keyboard-only dnd stays working (Space guard rule).
- Group block drag: handle on header; whole block (header + rows) moves; collapse blocks while dragging for a stable target. Persistence: see Assumption 2.
- Portfolio total row (existing summary) uses same rule incl. realized from hidden types; hidden-type realized shown as one muted line under the total: `incl. realized +Xk` (same sub-line style).

### 2. Row swipe actions (D-01)

Order left to right (revealed on swipe-left): **Sell** (icon `ArrowRightLeft`, label "Sell") · **Edit** (existing) · **Delete** (existing Trash2, destructive text). Each 44x44 min; preserve `touch-pan-x` and the drag-handle/swipe separation already in `investment-row-sheet.tsx`. Desktop: existing hover/expanded affordance gets the same three actions. No Withdraw icon.

### 3. Sell sheet (D-01..D-04, D-06, D-17) — looks and flows like add-investment

shadcn `<Sheet>` bottom/right as `holding-sheet.tsx` (same width, header, sticky footer, safe-area `pb-xl`). Title: "Sell {holding name}". Single scroll, steps shown as stacked sections (not a wizard; there is no step-advance button), in this order:

1. **How much is left?** — Quantity holdings: input "Quantity left" (unit label) with helper "You hold {qty}". Amount holdings (qty=1): input "Value left" in holding currency with helper "Current value {value}". A "Sell everything" text button sets left = 0 (holding is closed/archived, row disappears). Validation: 0 <= left < held (left = held is rejected: "Nothing to sell"). Live preview card (surface-card-dark): "Row after sale" 24/600 value, `cost` and `+x%` P/L (unchanged % for amount holdings), and "Realized on this sale" colored.
2. **Where did the money go?** — three radio-cards (min 44px tall, 14/600 title + 12/400 description), selected = yellow border:
   - New investment — "Open a new holding with the money"
   - Existing investment — "Add the money to a holding you already have"
   - Out of investments — "Withdrew it — it leaves your investments"
3. **Destination detail** (by choice):
   - New: embeds the SAME type picker + type-specific form used by add-investment (name, ticker search etc.), buy amount fixed to "Amount received" (read-only mirror). Live-priced destination (Assumption 6): user enters "Quantity bought"; "Amount received" prefilled from source value. Sections: type picker -> form fields.
   - Existing: searchable select of the budget's other holdings (grouped by type label, shows name + type chip + currency). Allowed across types (Assumption 5). Tracked destination also asks "Quantity bought".
   - Out: nothing extra; currency selector (default source currency, switchable) sits in step 4.
4. **Amount received** — money input + currency chip. Currency = destination's currency (New/Existing) or source (Out, switchable). Prefilled with today's value of the sold part at today's rate; helper "Prefilled from today's value. Change it to what actually landed." (D-17). Realized recalculates live.
5. **Date** — date field, default today, past dates allowed, future disallowed (max = today). Same date input component as other forms.

Footer: primary yellow button, label by destination: "Record sale" (New/Existing) / "Record withdrawal" (Out). Secondary "Discard sale". Submit disabled until valid; shows spinner label "Saving…". One request, one server tx; failure = rollback toast (offline-write rules; no queue). Success: close sheet, toast "Sale recorded" / "Withdrawal recorded"; invalidate investments, type-summary, history, overview.

States: loading (submit pending), FX unavailable (see Error), keyboard-open iOS: footer stays above keyboard (reuse holding-sheet viewport handling).

### 4. Edit — "What happened?" (D-03, roadmap points 5/6)

Edit sheet keeps existing fields. When the user changes **value** (hand-valued holdings) and saves, an extra section appears inline above the footer: "What happened?" radio-cards:

- Value changed — "The market moved" (default; booked as value-change, no money flow)
- Added money — "I put in more" (cost + contributions rise by the difference)
- Withdrew money — "I took money out" (same booking as Sell -> Out of investments; shows Amount received = difference prefilled, currency, and date)
  Added/Withdrew show a date field (default today). The footer primary button label follows the selected choice: "Save new value" / "Record added money" / "Record withdrawal". Quantity/tracked holdings: changing quantity asks "Bought more" / "Sold some" (Sold some hands off to the Sell sheet).

**Change type** = correction: type picker in Edit shows helper "Changing the type only corrects a mistake. Past history stays with this holding." No money booking. The holding moves to the new type's group block; if new type has no block it appears at the end.

### 5. History section (D-05, D-06, D-09) — inside edit sheet

Collapsible section "History" below the form (collapsed by default, count badge in header e.g. "History (4)"). Rows newest first, each (min 56px): kind label (14/600) · date (12/400 muted) · right: amount (BinancePlex 14/400, signed, colored by sign only for Realized sub-text) · optional note line: `Realized +3.5k` (12px, colored) · Trash2 icon-button (44px target, aria-label "Delete entry").
Kinds: Start, Bought, Added, Sold, Withdrew, Value changed, Converted in, Converted out. "Converted" rows show counterparty name ("to Erste EUR"). Entries are read-only (no inline edit; delete and re-enter). Start entry carries muted tag "Automatic".
Delete -> AlertDialog (Assumption 3). Deleting a convert row deletes both legs (copy says so). Empty state: see Copywriting.

### 6. Delete holding (Assumption 1)

Swipe Delete -> existing AlertDialog; destructive confirm. Holding and all its history are erased (realized and contributions recompute).

---

## Copywriting Contract (EN; PL + UK keys required in `apps/web/messages/{en,pl,uk}.json` for EVERY new or changed string below)

New namespace `investments.sell`, `investments.typeGroup`, `investments.history`, `investments.edit.whatHappened`. All three locales must be added in one change; rebuild `web` to see them. NEVER use the word "draft".

| Element                                | Copy                                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary CTA (sell)                     | Record sale                                                                                                                                                                                              |
| Primary CTA (withdraw)                 | Record withdrawal                                                                                                                                                                                        |
| Primary CTA (edit what-happened)       | Per choice: Save new value (Value changed) / Record added money (Added money) / Record withdrawal (Withdrew money)                                                                                       |
| Secondary (Sell sheet footer)          | Discard sale                                                                                                                                                                                             |
| Swipe action                           | Sell                                                                                                                                                                                                     |
| Sheet title                            | Sell {name}                                                                                                                                                                                              |
| Step 1 label                           | How much is left?                                                                                                                                                                                        |
| Quantity helper                        | You hold {qty}                                                                                                                                                                                           |
| Value helper                           | Current value {value}                                                                                                                                                                                    |
| Sell-all link                          | Sell everything                                                                                                                                                                                          |
| Step 2 title                           | Where did the money go?                                                                                                                                                                                  |
| Dest options                           | New investment / Existing investment / Out of investments                                                                                                                                                |
| Dest descriptions                      | Open a new holding with the money / Add the money to a holding you already have / Withdrew it — it leaves your investments                                                                               |
| Amount label                           | Amount received                                                                                                                                                                                          |
| Amount helper                          | Prefilled from today's value. Change it to what actually landed.                                                                                                                                         |
| Quantity bought label                  | Quantity bought                                                                                                                                                                                          |
| Date label                             | Date                                                                                                                                                                                                     |
| Preview                                | Row after sale / Realized on this sale                                                                                                                                                                   |
| Type header sub-line                   | incl. realized {+28k}                                                                                                                                                                                    |
| Tap sum-up rows                        | Unrealized / Realized / Total P/L / Lifetime return                                                                                                                                                      |
| What happened title                    | What happened?                                                                                                                                                                                           |
| What happened options                  | Value changed / Added money / Withdrew money (+ descriptions above)                                                                                                                                      |
| Change-type helper                     | Changing the type only corrects a mistake. Past history stays with this holding.                                                                                                                         |
| History section title                  | History ({count})                                                                                                                                                                                        |
| History kinds                          | Start / Bought / Added / Sold / Withdrew / Value changed / Converted in / Converted out                                                                                                                  |
| Start tag                              | Automatic                                                                                                                                                                                                |
| Empty state heading (History)          | No history yet                                                                                                                                                                                           |
| Empty state body (History)             | Sales, deposits and withdrawals you record will show up here.                                                                                                                                            |
| Empty state (investments, no holdings) | existing copy unchanged (no new empty state; hidden types are simply absent)                                                                                                                             |
| Toasts                                 | Sale recorded / Withdrawal recorded / Entry deleted                                                                                                                                                      |
| Error: save failed                     | Couldn't save this. Check your connection and try again. (rollback toast)                                                                                                                                |
| Error: FX                              | No exchange rate for {currency} on {date}. Pick another date or currency.                                                                                                                                |
| Error: left too high                   | Value left must be less than what you hold.                                                                                                                                                              |
| Error: received                        | Enter an amount received greater than 0.                                                                                                                                                                 |
| Error: future date                     | Date can't be in the future.                                                                                                                                                                             |
| Destructive: delete history entry      | Delete entry?: This removes the {kind} from {date} and recalculates realized gain and contributions. The holding's quantity and cost are not restored. Buttons: Delete entry / Keep entry                |
| Destructive: delete convert entry      | Delete conversion?: This removes both sides of the conversion (this holding and {other}) from history. Quantity and cost are not restored. Buttons: Delete conversion / Keep conversion                  |
| Destructive: delete holding            | Delete {name}?: This erases the holding and its entire history as if it never existed. Realized gain and contributions will be recalculated. This can't be undone. Buttons: Delete holding / Keep {name} |

Destructive actions this phase: Delete holding, Delete history entry (incl. convert pair). All use AlertDialog with explicit consequence copy; no typed confirmation.

---

## Accessibility and Platform

- Radio-cards are `role="radio"` in a `radiogroup`, arrow-key navigable; selected state not conveyed by color alone (check icon + border).
- P/L signed with +/- text and trend icon, not color alone.
- History delete buttons have aria-labels with entry kind and date.
- Drag handles: keyboard dnd retained; announce block moves via existing dnd-kit announcements, localized.
- iOS: swipe uses `touch-pan-x`; sheets respect safe-area and keyboard (reuse holding-sheet viewport handling); Radix `onCloseAutoFocus` preventDefault to avoid focus-visible ring after close.
- Phone viewport (390px) is primary; verify long PL/UK strings do not truncate header sub-line (use `break-words`, `min-w-0`).
- Loading: type headers and history show Skeleton rows using existing `wallets-skeleton`.

---

## Registry Safety

| Registry        | Blocks Used                                                                             | Safety Gate    |
| --------------- | --------------------------------------------------------------------------------------- | -------------- |
| shadcn official | Sheet, AlertDialog, Collapsible, Popover, Button, Input, Select (all already installed) | not required   |
| Third-party     | none                                                                                    | not applicable |

---

## Assumptions to confirm

1. **Delete holding** erases the holding and its history (locked roadmap behavior). Confirm dialog warns history is erased. Research alternative (archive and keep entries) not adopted.
2. **Group order** stored per budget per D-12. Research suggests per-member `ui_prefs`; spec follows D-12 (shared across members). If per-budget storage proves impractical, fall back to per-member `ui_prefs` and note it in the PLAN.
3. **Deleting a Sold/Withdrew history entry** reverses realized + contributions only; confirm copy states quantity/cost are not restored.
4. **Deposit sell**: complete only (no "How much is left?" step; Sell-everything fixed; step 1 shows read-only value).
5. **Sell into existing holding of a different type** is allowed; realized stays with source type.
6. **Live-priced destination**: user enters "Quantity bought"; "Amount received" prefilled from source value.
7. Header P/L % shows `—` only when lifetime cost is 0.
8. Typography uses weights 400/600 only for new elements even where legacy number classes use 500.
9. Sell action uses neutral elevated surface (not green/red) to keep trading colors price-direction only.
10. Future dates rejected on Sell/Add/Withdraw (past allowed per D-06).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
