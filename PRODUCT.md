# Budget — Family Budgeting & Wealth Tracker

> Synthesized from `.planning/PROJECT.md` and `CLAUDE.md` for impeccable design context.

## Register

**product** — design serves the product. The app is a long-lived household financial tool used weekly to monthly; surfaces are predominantly transactional (forms, tables, action queues, charts). Marketing/landing is a thin sliver.

## Product Purpose

Replace an advanced personal-budget Excel spreadsheet with a multi-tenant SaaS that lets a family plan and track expenses, manage a "Reserve" buffer for irregular costs, run a "Cushion" austerity-mode budget, monitor multi-asset investments (stocks, crypto, gold, real estate, bonds), and surface a single Tasks queue that says exactly what to do this week to keep all three healthy.

It is not a chat-with-your-data toy, not a tax tool, not a custodial wallet, and not a bank. It is a **deterministic household ledger + planner with LLM at the edges** (onboarding wizard, structured task generation).

## Users

### Primary

- **Spreadsheet-evolved household lead.** Mid-30s to mid-50s, technical-or-numerate, has used a multi-sheet Excel budget for years and outgrown it. Cares about correctness, history, and "I can see what changed when." Uses the app at a desk for monthly close, on phone for capture-on-the-go. Multi-currency (works/lives across currencies, holds crypto / gold / foreign accounts).
- **Co-owner partner.** Often less technical, needs the same data without rebuilding the spreadsheet's mental model. Cares about clarity over density.
- **Other household members (roles: member, eventually viewer).** Add expenses, see the family budget, never see the lead's personal budget.

### Secondary (post-v1)

- **Other families** signing up to the SaaS. Same user shape but no migration history; depend on the conversational onboarding wizard to seed categories and budgets.

## Tone

- **Authoritative without being patronizing.** Trading-platform sober, not Mint-cute. When the app suggests "Move €420 from Reserve to spending account," the user must trust the math without checking it.
- **Confident, even when proposing.** Tasks read as direct instructions ("Move €420 to Reserve"), not soft suggestions ("Maybe you'd like to consider…").
- **Numerate first.** Numbers always render in tabular type. Currency, sign, and direction are unambiguous on first glance.
- **Calm under stress.** Negative balances, overspends, and "cushion below target" states must read as actionable, not alarmist. No red-flood, no shame.

## Brand Anchors

- **Single-accent voltage.** One color carries the whole brand identity (Binance Yellow `#FCD535`). It is scarce, never decorative — primary CTAs, value-claim moments, brand mark only.
- **Dark canvas as default.** Marketing and product surfaces both default to near-black `#0b0e11`. Light mode exists for transactional dialogs (capture, deposit, settings forms) — never as the page floor for the dashboard.
- **Numbers are sacred.** A separate tabular typeface (BinancePlex / equivalent) carries every monetary figure, percentage, and stat counter. Mixing numeric and editorial typefaces inside a number is a system violation.
- **Trading semantics.** Green up / red down is reserved for direction-of-change signals (price, balance delta) — not for generic success/error.
- **Flat color blocks, no atmospherics.** Depth comes from contrast between canvas and surface, never from gradients, glow, or glass. The single permitted exception is the Reserve / Cushion launch hero (yellow-to-dark vertical gradient) and only there.

## Anti-References

What this app must **not** look like:

- **Mint / Personal Capital / mass-market PFM.** Pastel pie charts, friendly cartoon icons, "achievements." Wrong audience: this user owns spreadsheets and wants a tool, not a coach.
- **Quicken classic / GnuCash.** Beige toolbars, dense menubars, tiny system fonts. Right user, wrong era — the app must feel modern enough that the user's partner doesn't refuse to open it.
- **Generic SaaS dashboard cliché.** "Welcome back, Sarah" + 4 hero metric cards (total spend, total saved, total invested, big-number-up-and-to-the-right) + indigo gradient. Hero-metric template is the impeccable absolute ban.
- **Crypto-bro neon-on-black.** Glowing accents, holographic gradients, "Web3" energy. Same canvas color as Binance, opposite voice.
- **YNAB envelope-method UI.** Heavy left-rail category list + paycheck-by-paycheck mental model. We use Reserve + Cushion, not envelopes; layout and naming must reflect that.

## Strategic Principles

1. **The Tasks queue is the front page of the product, not the chart wall.** Whatever else exists, "what do I do this week?" must be one click from anywhere.
2. **Capture must be 3 taps from any screen.** Voice and form expense capture are the highest-frequency action; design treats it as a first-class affordance, not a hidden + button.
3. **Multi-currency is invisible most of the time, undeniable when it matters.** Default-currency totals run the dashboards; foreign-currency originals stay one tap away on every transaction row.
4. **Reserve and Cushion are first-class, not buried in settings.** They are the user's mental model, not power-user features.
5. **Personal vs. shared scope is always visible.** A persistent affordance (chip / toggle / scope label) makes "is this on my private budget or the family budget" answerable without thinking.
6. **History is queryable, not buried.** Append-only ledger and audit history surface as visible "what changed when" affordances on every editable row.
7. **Empty states sell the next action.** A new family with no expenses sees a Tasks queue that pre-populates with "Add your first category" / "Tell us your default currency" / "Try a voice expense" — not a smiley graphic.
8. **The PWA is not a desktop port.** Mobile-first capture (voice, quick-add) and at-a-glance Tasks are designed for phone before desktop.
9. **Dense over airy.** This is a tool, not a marketing page. 80px section rhythm, not 128px. Numbers want each other's company; whitespace between bands does the separation work, not within them.
10. **i18n / RTL-readiness from the first commit.** EN / PL / UK at launch; copy must never sit in Tailwind classnames and layouts must not break when Polish strings double-length.

## Surface Inventory (rough)

- **Marketing**: root `/` landing band + sign-in + sign-up (≈3 pages, dark canvas). Light footer per DESIGN.md inversion.
- **App shell**: persistent top nav (workspace switcher, scope toggle, capture button, user menu). Dark canvas everywhere.
- **Onboarding**: wizard (text + voice) post-signup → produces editable category/budget plan.
- **Workspaces**: list, detail, create, invite, shares (per-member privacy).
- **Tasks queue**: the single inbox of system-suggested actions.
- **Capture**: form + voice expense entry.
- **Budget views**: per-category limits (normal + cushion), monthly close.
- **Reserve**: balance per category + overall, suggested moves.
- **Cushion**: target vs. holdings, suggested top-ups / redeploys.
- **Investments**: positions across asset classes, growth charts.
- **Insights**: spending growth, overspent timelines, reserve / cushion adequacy curves.
- **Settings**: language, voice provider, LLM provider, default currency, sessions, notifications, data export / delete.
- **Comparison** (opt-in): anonymized peer benchmarks per category.

## Success Tells

A redesign succeeds when:

- A spreadsheet-evolved user installs the PWA, taps the home icon, and within 5 seconds knows what their Tasks queue says without reading any heading.
- The partner-user opens the same app and never asks "what's the difference between Reserve and Cushion" — the screens explain it themselves.
- The numerate user looks at any monetary figure and trusts it without re-checking the math.
- A Polish or Ukrainian user feels the app is theirs, not a translated American product.
