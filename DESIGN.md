---
name: Golden Friendship Family Clinic
description: Warm, confident clinic interface — deep forest fields, warm cream ground, gold that carries meaning
colors:
  primary: "#1a5c3a"
  primary-foreground: "#faf8f2"
  field: "#143d28"
  field-foreground: "#faf8f2"
  field-muted: "#b9cfc1"
  gold: "#b8860b"
  gold-ink: "#8a650a"
  gold-foreground: "#faf8f2"
  background: "#faf8f2"
  foreground: "#1c1917"
  card: "#ffffff"
  card-foreground: "#1c1917"
  muted: "#f0ece4"
  muted-foreground: "#78716c"
  secondary: "#f0ece4"
  secondary-foreground: "#44403c"
  border: "#e7e2d9"
  input: "#e7e2d9"
  ring: "#2d8a56"
  destructive: "#c0392b"
  sidebar: "#1a3a28"
  sidebar-foreground: "#e8e4dc"
  selection: "oklch(0.55 0.15 155 / 0.25)"
typography:
  display:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "clamp(2.75rem, 7vw, 4.75rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "clamp(1.75rem, 3.2vw, 2.375rem)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.35
  lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  meta:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.13em"
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.4
  control:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.4
  stat-figure:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "3.25rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  sm: "4px"
  md: "5px"
  lg: "6.25px"
  xl: "8.75px"
  "2xl": "11.25px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-field:
    backgroundColor: "{colors.field-foreground}"
    textColor: "{colors.field}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  mark:
    border: "1px solid currentColor"
    textColor: "status-dependent"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  masthead:
    backgroundColor: "{colors.field}"
    textColor: "{colors.field-foreground}"
    rounded: "{rounded.2xl}"
    padding: "24px 28px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Golden Friendship Family Clinic

## Overview

**Creative North Star: "Warm Confidence", deepened — the clinic's front wall and its desk book.**

The clinic has two real objects and the interface is built from both. Outward is the **front wall**: a deep forest field carrying the name, the hours, and the honest three-step flow, with a community board of pinned notices below it. Inward is the **desk book**: the ruled appointment ledger the front desk actually worked from before this app existed — a time running down the left gutter, records entered in reading order, states written down as inked marks rather than colored pills.

Two things changed in this pass, and they are what separate it from the earlier version:

1. **The palette now owns regions, not accents.** Previously every screen was a neutral cream ground with green and gold scattered over it as accents, which is exactly what makes an interface read as "a framework with a theme." Now the deep field (`#143d28`) is a material that owns whole areas — the public hero, the auth split, and every page's masthead — and the cream ground is what the records sit on.
2. **The world reaches past the front door.** The landing page's board language previously stopped at the login screen; the interior was stock. Now the interior has its own translation of the same world and its own vocabulary — masthead, ledger, mark, step rail — used on all thirteen routes.

It still refuses the generic SaaS look, and it now also refuses its own earlier timidity: no gray shadows, no backdrop blur, no decorative gradients, and no three-identical-cards dashboard.

**Key Characteristics**
- Two zones: a deep forest field for context and identity, a warm cream ground for records and forms
- Gold carries information, never decoration (see *The Gold Has a Job Rule*)
- Six type registers, including a mono data register for every figure the clinic reads off a screen
- Ruled lines, a time gutter, and inked state marks — the desk book's vocabulary
- Warm offset shadows; paper objects sit on a desk, they do not glow
- Light only, deliberately: this is a daylight clinic with no dark rendition

## Colors

**Strategy: Committed.** One saturated color carries 30–60% of each surface. The previous restrained strategy (neutrals plus one accent) is what made the app read as basic.

### Primary — Forest Green `#1a5c3a`
Actions, active states, confirmed records, focus. The authoritative color.

### Field — Deep Forest `#143d28`
A sanctioned darker step of the primary ramp. Owns whole regions: the public hero, the auth split panel, every page masthead. On the field, secondary text uses **Field Muted** `#b9cfc1`, never a translucent white.

### Accent — Warm Gold `#b8860b`
The clinic's signature, and the color that carries meaning. For text-sized gold on cream, use **Gold Ink** `#8a650a` — the canonical gold does not hold contrast below 18px.

### Neutral
- **Warm Cream `#faf8f2`** — the ground. Every page background. Never pure white.
- **Card White `#ffffff`** — elevated paper: cards, dialogs, pinned notices.
- **Warm Stone `#f0ece4`** / **Stone Border `#e7e2d9`** — secondary fills, rules, input borders.
- **Ink `#1c1917`** — primary text, warm near-black.
- **Muted Stone `#78716c`** — secondary text.
- **Board Ground `#f3f1e9`** — the one slightly darker cream, used only for the landing board.
- **Current Highlight `#fdf6e3`** — the fill behind the step you are standing on.

### Semantic
- **Destructive `#c0392b`** — cancelled, no-show, failures. Warm red.
- **Pending** is gold. **Confirmed** is primary. See the rule below.

### Named Rules

**The Gold Has a Job Rule.** Gold marks *time, money, and the next thing that matters* — and nothing else. Concretely, gold is permitted on: the pins on the board; the step you are currently on; a `PENDING` state; input that is still a placeholder; a payment reference or money figure; the current day; the "still to come" or "needs attendance" count; and the hairline across a masthead. Gold on a decorative dot, a generic icon, or a bullet is a bug.

**The Two-Zone Rule.** Context and identity are set on the deep field. Records, forms, and anything a person reads for minutes at a time sit on cream. Never put a form on the field; never put a masthead on cream.

**The Warm Ground Rule.** Page backgrounds are never pure white. White is reserved for paper that lifts off the cream.

## Typography

**Display:** DM Serif Display 400 · **Body:** Geist · **Data:** Geist Mono

The pairing is deliberate contrast, but the identity comes from *how* the three are used rather than from the faces themselves:

- **The serif is the clinic's voice.** Only for the clinic's name, page titles (via `PageMasthead`), pinned-notice headings, and the one headline figure a report exists to give.
- **Geist Mono is the operational data layer.** Every time, date, count, phone number, payment reference and percentage is set in mono with tabular figures. Nothing else is. This single rule is what makes the console read like a clinic's log book instead of a dashboard, and it lines figures up down a column for free.
- **Geist carries everything else.**

### Registers

| Register | Size | Face | Job |
|---|---|---|---|
| `display` | `clamp(2.75rem, 7vw, 4.75rem)` | serif | The clinic's name on the public hero |
| `title` | `clamp(1.75rem, 3.2vw, 2.375rem)` | serif | Every page title, inside the masthead |
| `stat-figure` | `3.25rem` (unit `1.75rem`) | serif | The single number a report answers with |
| `section` | `1.0625rem` | sans 600 | Card and block headings |
| `lead` | `1.0625rem` | sans | The one explanatory sentence under a title |
| `body` | `1rem` | sans | All prose, max 68ch |
| `label` | `0.875rem` | sans 500 | Form labels, navigation |
| `data` | `0.9375rem` | mono 500 | Times, dates, counts, refs, phones |
| `meta` | `0.6875rem` tracked `0.13em` | sans 600 | Tracked uppercase field labels |
| `control` | `0.8rem` | sans 500 | Small control text (buttons, calendar cells) |

Body copy uses `text-xs` (0.75rem), `text-sm` (0.875rem), `text-base`, `text-xl` and `text-2xl` from the Tailwind scale where a register is not called for.

### Named Rules

**The Single Weight Rule.** DM Serif Display ships one weight. Never apply `font-semibold`/`font-bold` to a serif heading — that is faux-bold, and it is the fastest way to make a display face look cheap. `.font-heading` sets `font-weight: 400` and `font-synthesis-weight: none` to make this structurally impossible.

**The Mono-For-Figures Rule.** If a value is a time, a date, a count, a percentage, a phone number, or a payment reference, it is `.figure` (Geist Mono, tabular, slashed zero). If it is prose, it is not.

**The No Serif in Chrome Rule.** The serif never appears in navigation, buttons, badges, table headers, or body text. A card heading is `section`, not serif.

## Layout

**Public:** full-bleed bands. The hero is a deep field that fills the first viewport on desktop (`lg:min-h-[74svh]`); the board section follows on cream; a closing field band anchors the page.

**Auth:** a two-zone split above `lg` — field panel with identity beside a calm cream form column (`max-w-md`). Below `lg` the panel collapses to a compact header strip so the form is the first thing on screen.

**Authenticated:** fixed sidebar (16rem) + content area with `p-4 sm:p-6` and `gap-6`. Every page opens with its `PageMasthead`, then its content.

**Ledger rows:** `5.5rem 1fr` on mobile, `5.5rem 1fr auto` at `sm` and above — a fixed time gutter, the record, then actions.

**Spacing rhythm:** `gap-6` between major blocks, `gap-4` between cards, `gap-3.5` between fields. More space above a heading than below it. Section headings inside a ledger use `mt-6`/`mt-8` above and `pb-2` below.

## Elevation & Depth

Warm shadows with a visible Y-offset. Cold, centered halos read as software; warm, offset ones read as objects on a desk.

- **`shadow-warm`** (`0 1px 2px oklch(0.2 0.02 80 / 0.05), 0 4px 12px oklch(0.2 0.02 80 / 0.07)`) — standard paper: cards, toolbars, inline records.
- **`shadow-warm-lg`** (`0 2px 6px / 0.06, 0 10px 28px / 0.13`) — the board container and every masthead.
- **Flat** — ledger rows, the chrome bar, the sidebar, and anything that is part of the page rather than an object on it.

**No glass.** Backdrop blur is banned anywhere in the app; it was removed from the chrome bar in this pass. Depth comes from offset shadows and warm borders only.

## Shapes

Consistently rounded, never bubbly. Cards and elevated containers `rounded-xl` (8.75px); buttons, inputs and selects `rounded-lg` (6.25px); mastheads `rounded-2xl`; status marks are **not** pills — they are squared (`rounded-sm`) so they read as ink on paper rather than as tags.

**The Radius Consistency Rule.** Cards `rounded-xl`, controls `rounded-lg`. A card with a control's radius looks like a button; a button with a card's radius looks like a card.

## Components

### PageMasthead
Every page's identity carrier, and never the same twice because it carries that page's real context rather than a bare title. Deep field, `rounded-2xl`, a gold hairline drawing itself across the top (`rule-draw`), an optional tracked `meta` line above a serif `title`, an optional `lead` sentence, an optional `actions` slot on the right, and an optional `MastheadStats` strip along the foot dividing the field into 2 (mobile) or 4 (desktop) figures — mono, with `tone: "gold"` reserved for the count that needs acting on.

### Ledger
The desk book. `<Ledger>` is an `<ol>` with a top rule; `<LedgerRow index>` is a ruled grid row with an authored ink-in stagger; `<LedgerTime>` is the mono time in the left gutter; `<LedgerHeading trailing>` is a tracked day heading with a 2px rule. Used by the desk run-sheet, all appointments, the doctor's agenda, and the patient's own history.

### StatusMark / AttendanceMark / SourceTag
States are written down as **inked marks**, not pills: squared, mono, uppercase, tracked, with a colored border and a tinted fill. `PENDING` → "Awaiting action" in gold (the state waiting on a human). `CONFIRMED` → "Confirmed" in primary. `CANCELLED` → "Cancelled" in destructive. `ATTENDED` / `NO_SHOW` likewise. Copy is spelled out rather than the raw enum. `SourceTag` is quiet tracked text — context, not state.

### StepRail
A divided strip of numbered steps (`done` = filled circle-and-check, `current` = gold number on the highlight fill, `todo` = muted). Used by the patient's three-step request and the desk's three-step walk-in registration. Gold marks the step you are standing on.

### ProportionBar
Report data drawn from the real numbers with no chart library: one bar per composition question plus its own legend carrying count and percentage. Renders a dashed placeholder rather than an empty bar when the range has nothing in it.

### Buttons
Primary (forest), outline, ghost, destructive, `field` (cream on the deep field), `field-outline`, and `gold` (money and payment actions only). Min height 36px small / 40px default / 44px large. No `transition-all`.

### The chrome bar
Deliberately quiet: a hairline-bottomed cream bar holding who you are, the role you are acting as, and sign-out. Identity lives in the sidebar and the mastheads, not here.

### The sidebar
Deep forest, a gold monogram seal, the clinic name in serif, the role as a tracked uppercase line, grouped navigation with tracked group headings, and a **gold left rule on the active item**. The clinic's address sits in the footer.

### Empty states
`EmptyState`: a dashed-ruled blank area — honestly reading as space in the book that nothing has been written into yet — with a serif line, one explanatory sentence, and always the single action that would fill it. Never a bare sentence.

### Loading states
Skeletons shaped like the content they replace: mono-width lines in a ledger, time-chip blocks in the slot picker, a row list in a table. Never the word "Loading…" alone, except as a button's own pending label.

## Do's and Don'ts

### Do
- **Do** open every authenticated page with `PageMasthead` carrying that page's real context — the date, the counts, the primary action.
- **Do** set every time, date, count, percentage, phone and payment reference in `.figure` (mono, tabular).
- **Do** use `Ledger`/`LedgerRow`/`LedgerHeading` for any list of records.
- **Do** use `StatusMark` for appointment states rather than inventing a badge.
- **Do** keep gold to its list of permitted jobs, and use `--gold-ink` for gold text below 18px.
- **Do** use `shadow-warm`/`shadow-warm-lg` on paper, and nothing on the page itself.
- **Do** wrap every animation in a `prefers-reduced-motion` guard; `ink-in`, `pin-notice`, `page-enter` and `rule-draw` all have one.
- **Do** use `role="alert"` for errors and `role="status"` for results that must survive a toast.
- **Do** keep `aria-hidden` on decorative icons and give every icon-only control an accessible name.

### Don't
- **Don't** put a form, table, or ledger on the deep field.
- **Don't** use `font-semibold` with the serif face.
- **Don't** use pills for status, or `rounded-full` on cards and containers.
- **Don't** apply gold to decoration: a stray dot, a generic icon, a divider that means nothing.
- **Don't** use pure white as a page background; the ground is cream.
- **Don't** use gray shadows, `transition-all`, gradient text, glass, or decorative blur.
- **Don't** render a placeholder value as if it were real. The public phone number shows the sample number only while clearly marked as illustrative (never as a `tel:` link); the real, linked number appears the moment the clinic sets one.
- **Don't** add kicker lines, eyebrow labels, or section numbers above headings.
- **Don't** repeat a page title in both the masthead and the first card.
