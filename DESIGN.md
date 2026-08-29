---
name: Golden Friendship Family Clinic
description: Warm, confident clinic scheduling interface with forest green and gold palette
colors:
  primary: "#1a5c3a"
  primary-foreground: "#faf8f2"
  gold: "#b8860b"
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
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
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
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Golden Friendship Family Clinic

## Overview

**Creative North Star: "Warm Confidence"**

A clinic scheduling interface that feels like walking into a trusted neighborhood practice — warm, grounded, and unmistakably real. The palette draws from the natural world of health and trust: deep forest greens that say "this is a place of care," warm golds that echo the clinic's name and the golden friendship it promises, and a cream ground that feels like sunlight on a well-kept waiting room. Nothing is cold, nothing is clinical in the sterile sense.

The design refuses the generic SaaS look. No blue gradients, no floating cards on gray, no corporate sterility. Instead: warm shadows with visible offset, a serif display face that gives headings genuine personality, and a color system where every token earns its place through meaning (green = health, gold = warmth, cream = welcome). The landing page's community-board concept — pinned notices with gold pins, slight rotations, settle animations — sets the tone: this is a real place, not a software product pretending to be one.

**Key Characteristics:**
- Forest green primary anchors every action and navigation element
- Warm gold accent appears sparingly — pins, icons, links — never overwhelming
- Cream ground (`#faf8f2`) throughout, never pure white backgrounds
- DM Serif Display for all headings — personality without decoration
- Warm shadows with visible offset, never cold gray halos
- Consistent `shadow-warm` utility across all card surfaces
- Page-enter fade animation for route transitions

## Colors

The palette is restrained: one saturated primary, one warm accent, and a family of warm neutrals. Colors appear at page scale — fields that own whole regions — never as scattered accents over a neutral ground.

### Primary
- **Forest Green** (#1a5c3a): The authoritative color. Used on primary buttons, sidebar background, active navigation states, and status badges for CONFIRMED appointments. Conveys health, trust, and groundedness.

### Accent
- **Warm Gold** (#b8860b): The clinic's signature. Used sparingly — gold pin icons on the landing page, the sidebar logo badge, link hover states, doctor name highlighting, and the "3" step indicator on the walk-in form. Its rarity is its power.

### Neutral
- **Warm Cream** (#faf8f2): The ground. Every page background. Never pure white — always this warm, sunlit tone.
- **Card White** (#ffffff): Card and popover backgrounds. Slightly warmer than system white due to the surrounding cream context.
- **Warm Stone** (#f0ece4): Secondary backgrounds, muted sections, secondary buttons. The bridge between cream and card.
- **Stone Border** (#e7e2d9): Dividers, input borders, card borders. Warm, not gray.
- **Ink** (#1c1917): Primary text. Near-black with warmth, never pure #000.
- **Muted Stone** (#78716c): Secondary text, labels, descriptions. Readable but quiet.

### Sidebar
- **Deep Forest** (#1a3a28): Sidebar background. Darker than primary, creating a clear navigation frame.
- **Sidebar Gold** (#b8860b): Sidebar logo badge and active ring color.
- **Sidebar Text** (#e8e4dc): Light text on the dark sidebar.

### Semantic
- **Destructive** (#c0392b): CANCELLED status, delete/cancel actions. Warm red, not harsh.
- **Ring** (#2d8a56): Focus rings. A lighter green that reads as "active" without being jarring.

### Selection
- **Green Tint** (oklch(0.55 0.15 155 / 0.25)): Text selection highlight. A translucent green tint that ties selections to the primary palette.

### Named Rules

**The Gold Sparingly Rule.** The gold accent appears on ≤5% of any given screen. Its rarity makes it meaningful — a gold pin, a gold link, a gold logo badge. When everything is gold, nothing is.

**The Warm Ground Rule.** Every background is warm. Pure white (`#ffffff`) is reserved for elevated surfaces (cards, popovers, dialogs) that need to visually lift off the cream ground. The page background is never white.

## Typography

**Display Font:** DM Serif Display (with Georgia, serif fallback)
**Body Font:** Geist (with system-ui, sans-serif fallback)
**Mono Font:** Geist Mono (for code and data)

**Character:** The pairing is deliberate contrast — a warm, characterful serif for headings that says "this place has personality" against a clean, modern sans-serif for body text that says "this is easy to use." The serif never appears in body text; the sans never appears in headings. This separation makes every heading a visual event.

### Hierarchy
- **Display** (400 weight, `clamp(2.25rem, 5vw, 3.75rem)`, line-height 1.15): Page titles only. The clinic name on the landing page, section headings like "Book an Appointment." Always set in DM Serif Display via `fontFamily: "var(--font-heading)"`.
- **Headline** (600 weight, 1.5rem, line-height 1.3): Card titles and section headers within pages. Set in Geist with semibold weight.
- **Title** (600 weight, 1rem, line-height 1.4): Subsection headers, step labels ("1. Patient", "2. Schedule"). Set in Geist.
- **Body** (400 weight, 1rem, line-height 1.6): All body text, descriptions, paragraphs. Max comfortable measure: 65–75ch.
- **Label** (500 weight, 0.875rem, line-height 1.4): Form labels, navigation items, badges. Uppercase not used.

### Named Rules

**The Heading Font Rule.** DM Serif Display is used ONLY for `fontFamily: "var(--font-heading)"` applied via inline style. It never appears in CSS utility classes or Tailwind config. This keeps the heading font intentional, not accidental.

**The Tabular Numbers Rule.** All numeric data columns (time displays, stat values, appointment counts) use `tabular-nums` for aligned digits. The stats on the reports page and the clinic hours on the landing page both use this.

## Layout

The layout is sidebar-driven for authenticated surfaces and single-column for public pages.

**Authenticated dashboards:** Fixed sidebar (280px desktop, collapsible on mobile) + content area with `p-6` padding. The sidebar uses the deep forest green background and contains navigation with gold logo accent. Content area has the cream background.

**Public pages (landing, login, signup):** Single centered column, max-width 600px for auth cards, max-width 1152px (6xl) for the landing board. Content is vertically centered in the viewport with `min-h-dvh`.

**Responsive behavior:** Sidebar collapses to a hamburger trigger below `md` breakpoint. The landing page's 3-column board stacks to single column on mobile. Tables get horizontal scroll containers (`-mx-2 overflow-x-auto px-2`) on small screens.

**Spacing rhythm:** Consistent `gap-6` (24px) between major sections. `gap-4` (16px) between cards in a grid. `gap-3` (12px) between form fields. More space above a heading than below it — headings have `mb` implicit through the gap structure.

## Elevation & Depth

The system uses warm shadows with visible offset — never cold gray, never zero-offset halos. Depth conveys hierarchy: the landing board sits highest, cards float above the ground, and the sidebar is a fixed frame.

### Shadow Vocabulary
- **shadow-warm** (`0 1px 3px oklch(0.2 0.02 80 / 0.06), 0 4px 12px oklch(0.2 0.02 80 / 0.08)`): Standard card elevation. Used on every Card component, stat boxes, and form containers.
- **shadow-warm-lg** (`0 2px 6px oklch(0.2 0.02 80 / 0.06), 0 8px 24px oklch(0.2 0.02 80 / 0.12)`): Elevated surfaces. Used on the landing page's board container. Higher offset, softer blur.
- **No shadow**: The sidebar, header, and inline content sections sit flat. Shadows are reserved for surfaces that need to "lift" off the ground.

### Named Rules

**The Warm Offset Rule.** Every shadow carries a visible Y-offset (never 0). Cold, centered shadows read as "software." Warm, offset shadows read as "object." The offset is what makes the pinned notices on the landing page feel like they're sitting on a board.

## Shapes

The form language is consistently rounded but never bubbly. Radii stay in the 6–16px range for cards and containers, 6.25px (the shadcn default `--radius`) for buttons, inputs, and smaller controls.

- **Cards and containers:** `rounded-xl` (8.75px) — warm and approachable without being pill-shaped.
- **Buttons and inputs:** `rounded-lg` (6.25px) — the project's base radius, applied consistently.
- **Stat boxes on reports:** `rounded-xl` (8.75px) — matching card radius for visual consistency.
- **Badges:** `rounded-full` (pill) — status badges are always fully rounded.
- **Sidebar logo badge:** `rounded-lg` (6.25px) — matches button radius.

### Named Rules

**The Radius Consistency Rule.** Cards and elevated containers use `rounded-xl`. Interactive controls (buttons, inputs, selects) use `rounded-lg` (the base radius). Never mix — a card with `rounded-lg` looks like a button; a button with `rounded-xl` looks like a card.

## Components

### Buttons
- **Shape:** Rounded-lg (6.25px radius), min-height 36px (sm) / 40px (default) / 44px (lg)
- **Primary:** Forest green background, cream text. Used for main actions (Sign in, Submit request, Book & confirm).
- **Outline:** Transparent background, border, foreground text. Used for secondary actions (Log in, Clear date).
- **Ghost:** No background, no border. Used for low-emphasis actions (Cancel in dialogs, Sign out).
- **Destructive:** Red background. Used only for cancel/delete actions.
- **Hover:** Background darkens slightly, text stays constant. Focus-visible ring in `--ring` color.
- **Disabled:** Reduced opacity (50%), pointer-events none.

### Cards
- **Shape:** Rounded-xl (8.75px radius), white background
- **Shadow:** `shadow-warm` on all cards. The landing board uses `shadow-warm-lg`.
- **Border:** 1px `var(--border)` — warm stone, never gray.
- **Internal padding:** 24px (p-6 or p-4 for compact cards)
- **No header division:** CardHeader and CardContent flow together without a visible separator.

### Inputs / Fields
- **Style:** Warm border (`var(--border)`), transparent background, rounded-lg.
- **Focus:** Border shifts to `var(--ring)` (lighter green), 3px ring in ring/50 opacity.
- **Placeholder:** Muted foreground text, ends with appropriate punctuation.
- **Error:** Border shifts to `var(--destructive)`, ring in destructive/20.
- **Disabled:** Background tints to `var(--input)/50`, reduced opacity.

### Navigation (Sidebar)
- **Style:** Deep forest green background, light text.
- **Active state:** Sidebar accent background (`#245038`), bold font weight.
- **Logo badge:** Gold background, cream text, rounded-lg icon container.
- **Clinic name:** DM Serif Display, white text.
- **Hover:** Subtle background shift to sidebar-accent.

### Status Badges
- **CONFIRMED:** Primary green background, cream text (via `variant="default"`).
- **PENDING:** Secondary stone background, stone text (via `variant="secondary"`).
- **CANCELLED:** Destructive red background, white text.
- **Completed:** Primary green background (reuses default variant).

### Dialogs
- **Shape:** Rounded-xl, white background, `shadow-warm-lg`.
- **Header:** Title in semibold, description in muted foreground.
- **Footer:** Ghost "Cancel" + primary "Confirm" (or destructive for delete actions).
- **Overlay:** Semi-transparent dark backdrop.

### Tables
- **Style:** Clean horizontal lines via `--border`. No vertical dividers.
- **Header:** Muted foreground text, medium weight.
- **Cells:** Default foreground, standard padding.
- **Responsive:** Wrapped in `-mx-2 overflow-x-auto px-2` for horizontal scroll on mobile.

## Do's and Don'ts

### Do:
- **Do** use `fontFamily: "var(--font-heading)"` via inline style for every page-level heading. This is the only way DM Serif Display enters the system.
- **Do** use `shadow-warm` on every Card component. The warm shadow is a signature of the visual system.
- **Do** use `tabular-nums` on any element displaying numeric data (times, counts, percentages).
- **Do** use the `page-enter` CSS class on layout content areas for smooth route transitions.
- **Do** use the gold accent sparingly — one or two gold elements per screen maximum.
- **Do** use `role="alert"` on error messages and `role="status"` on success banners.
- **Do** include `aria-hidden="true"` on all decorative icons (Lucide icons used for visual emphasis).

### Don't:
- **Don't** use pure white (`#ffffff`) as a page background. The ground is always warm cream (`#faf8f2`).
- **Don't** use gray shadows. All shadows use the warm `oklch(0.2 0.02 80 ...)` family.
- **Don't** use DM Serif Display in body text, labels, or navigation items. It's for headings only.
- **Don't** scatter gold accents across a page. Gold is a signature, not a highlight color.
- **Don't** use `rounded-full` on cards or containers. Pills are for badges and small controls only.
- **Don't** use `transition: all` on any element. List properties explicitly or use Tailwind's transition utilities.
- **Don't** add kicker lines, eyebrow labels, or section numbers above headings. The heading carries its own weight.
- **Don't** use gradient text, glass effects, or decorative blur. Depth comes from warm shadows, not visual effects.
