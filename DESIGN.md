---
name: Budgeteer
description: Collaborative offline-first personal finance tracker with E2E encryption
colors:
  background: "#ffffff"
  foreground: "#0a0a1a"
  card: "#ffffff"
  card-foreground: "#0a0a1a"
  popover: "#ffffff"
  popover-foreground: "#0a0a1a"
  primary: "#0f172a"
  primary-foreground: "#f8fafc"
  secondary: "#f1f5f9"
  secondary-foreground: "#0f172a"
  muted: "#f1f5f9"
  muted-foreground: "#64748b"
  accent: "#f1f5f9"
  accent-foreground: "#0f172a"
  destructive: "#ef4444"
  destructive-foreground: "#f8fafc"
  border: "#e2e8f0"
  input: "#e2e8f0"
  ring: "#0a0a1a"
typography:
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5715
  title:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
  headline:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  display:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-default-hover:
    backgroundColor: "{colors.primary}"
    opacity: 0.9
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    border: "1px solid {colors.input}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: transparent
    border: "1px solid {colors.input}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    border: "1px solid {colors.border}"
    padding: "24px"
  dialog:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.border}"
    padding: "24px"
---

# Design System: Budgeteer

## 1. Overview

**Creative North Star: "The Quiet Desk"**

Budgeteer's interface is a clean, ordered workspace where the numbers do the talking. Like a well-organized desk in a quiet room: everything has its place, nothing is loud, and the only thing that demands attention is the work itself — the user's financial data.

The system rejects gamification, decorative motion, and urgency tricks. Finance tracking is already emotionally loaded; the UI should feel like a trustworthy accountant's desk, not a dashboard designed to maximize engagement. Color is restrained. Typography is familiar and legible. Motion, when it occurs, is a 200ms response to an interaction, not a choreographed entrance.

The product register means this is a tool first. Users sit down to log a transaction, review spending, or invite a household member — and the UI should disappear into that task. Familiarity is the feature. The tool doesn't need to be remembered; it needs to be invisible on first use.

**Key Characteristics:**
- Restrained color: one neutral family (cool slate) with one accent (primary navy). Saturation below 5% on all surfaces.
- System font stack: no custom typeface. Reads instantly on every device.
- Flat by default, layered with purpose: tonal stacking for depth; shadows reserved for interactive states and modals.
- Consistent component vocabulary across every screen. A button is a button; an input is an input. No surprises.
- Generous whitespace (24px padding on cards, 24px sidebar padding, 24px page margins) punctuated by dense data rows.

## 2. Colors

The palette is a cool slate neutral family — low chroma (< 5%), blue-leaning hue (210°–265°). This is the Shadcn Slate default, deliberately un-customized: no warm tint, no brand color beyond the dark navy primary. The accent is defined by restraint, not saturation.

**Dual-mode system.** The UI supports both light and dark themes via a class-based toggle on `<html>`. The dark mode is not an inversion — it's a considered shift: backgrounds drop to deep neutral (OKLCH L 0.13), surfaces lift slightly lighter (L 0.16) for card distinction, and the primary accent becomes a lighter slate-blue (L 0.62) for readability against the dark background. The `muted-foreground` is bumped from L 0.55 to L 0.60 to maintain contrast. Theme preference is persisted to localStorage (`budgeteer_theme`) and defaults to the system `prefers-color-scheme`. A sun/moon toggle in the header lets users switch at any time.

### Primary
- **Primary** (`#0f172a`): Dark navy. Used for primary buttons, active navigation, and the sidebar brand mark. It is the only saturated surface color and appears on no more than 10% of any screen.

### Neutral
- **Background / Card / Popover** (`#ffffff`): Pure white content area. Used for the main page background, card surfaces, and dialog containers.
- **Foreground / Card-foreground / Popover-foreground** (`#0a0a1a`): Near-black with a cool blue undertone. Body text, headings, labels. Meets WCAG AAA against white.
- **Secondary / Muted / Accent** (`#f1f5f9`): Light cool gray. Used for the sidebar background (via `bg-card`), hover states, and the active nav item background.
- **Secondary-foreground / Accent-foreground** (same as primary, `#0f172a`): Text on muted/secondary surfaces.
- **Muted-foreground** (`#64748b`): Medium slate. Secondary text, placeholders, metadata labels. **Must meet 4.5:1 against white** — this is the most common contrast failure in similar systems.
- **Border / Input** (`#e2e8f0`): Subtle cool gray stroke. Card borders, input outlines, dividers.
- **Ring** (same as foreground, `#0a0a1a`): Focus ring on interactive elements.

### Dark Mode

The `.dark` class overrides the CSS custom properties for every role. Key differences from light mode:

- **Background** (L 0.13 → `#111318`): Deep cool-gray, not black. Avoids pure `#000` fatigue.
- **Card / Popover** (L 0.16 → `#15181e`): Slightly lighter than the background so cards read as distinct surfaces.
- **Foreground** (L 0.93 → `#eaebed`): Near-white with a cool cast. High contrast against the dark background.
- **Primary** (L 0.62 → `#7c8aab`): Lightened to a muted slate-blue. Against the dark card background, this provides a clear call-to-action without being harsh.
- **Secondary / Muted / Accent** (L 0.20): Dark surface for hover states, active nav items.
- **Muted-foreground** (L 0.60 → `#888f9e`): Brighter than light mode's `muted-foreground` (`#64748b`) to maintain legibility against the darker background.
- **Border / Input** (L 0.25 → `#2d3038`): Subtle stroke that separates surfaces without adding visual noise.
- **Destructive** (L 0.58): Slightly desaturated red to avoid eye strain on the dark background.

### Semantic
- **Destructive** (`#ef4444`): Red for destructive actions (delete account, remove user). Used as button background or text on destructive variants.
- **Destructive-foreground** (`#f8fafc`): White text on destructive buttons.

The income/expense signal uses the same red for expenses (`text-red-600`, approximately `#dc2626`) paired with green for income (`text-green-600`, approximately `#16a34a`). These are Tailwind defaults and carry no brand meaning — they are informational color coding only, always accompanied by a `+`/`-` sign.

## 3. Typography

**Display / Headline / Body / Label:** system-ui, -apple-system, sans-serif

A single-family stack. The system maps to SF Pro (macOS), Segoe UI (Windows), Roboto (Android) — familiar, humanist sans-serifs optimized for UI density. No custom font loading, no layout shift, no CDN dependency. The font itself disappears into the OS, matching every other native tool the user interacts with.

### Hierarchy

- **Display** (700, 1.875rem / 30px, 1.2): Page-level headings — "Dashboard", "Accounts", "Settings". Used once per page.
- **Headline** (600, 1.25rem / 20px, 1.2): Section headings — card titles, dialog titles, "Recent Transactions".
- **Title** (600, 1rem / 16px, 1): Card titles, sub-section headers.
- **Body** (400, 0.875rem / 14px, 1.5715): Primary reading size. Transaction amounts, account names, setting labels. Line length capped at 65–75ch for prose content; data tables may run denser.
- **Label** (500, 0.875rem / 14px, 1): Form labels, button text, nav items.
- **Small / Meta** (400, 0.75rem / 12px, 1.5715): Dates, secondary metadata. Applied via `text-xs` utility.

### Scale ratio

Approximately 1.14 between steps — tight enough that every size has a distinct role, loose enough that hierarchy is unambiguous at a glance.

- Body → Headline: 1.14× (14 → 16 → 18 → 20)
- Headline → Display: 1.5× (20 → 30)

The Display step is clamped at 1.875rem — never larger. The app is not a landing page.

**`text-wrap: balance`** is applied to all h1–h3 elements (page titles, card titles) via Tailwind's `text-balance` utility.

## 4. Elevation

Flat by default, layered with purpose. The system uses a hybrid approach: tonal color separation for structural depth, and a small shadow vocabulary for interactive and modal states.

**The Flat-By-Default Rule.** Surfaces sit on the same z-plane until an interaction or structural need lifts them. Sidebars and content panels are distinguished by background color and a 1px border, not by a drop shadow.

### Shadow Vocabulary

- **Card shadow** (`shadow-sm`): A subtle 1px y-offset shadow (`0 1px 2px 0 rgb(0 0 0 / 0.05)`) applied to card containers. This is the default surface elevation — present at rest.
- **Dialog overlay** (`bg-black/80`): 80% black overlay behind modals. The dialog content itself carries a `shadow-lg` (`0 10px 15px -3px rgb(0 0 0 / 0.1)`).
- **Hover lift**: Interactive cards (like the account list items in `AccountListPage`) lift on hover with `hover:shadow-md` and a `transition-shadow`.
- **Focus ring** (`ring-1 ring-ring`): A 1px solid ring using the foreground color on `focus-visible`. This is the primary focus indicator — no glow, no offset, just a crisp colored outline matching the text color.

### Planned (not yet implemented)

- **Tooltip / dropdown shadow**: `shadow-lg` for popover content and tooltips, matching the dialog pattern. These are the highest-elevation surfaces.

## 5. Components

All components are Shadcn UI primitives (Radix-based) styled with the token system above. The following is the canonical vocabulary.

### Buttons

**Shape:** Gently curved (6px / `rounded-md`). All variants share the same radius and height (36px / `h-9`).

- **Default** (`bg-primary text-primary-foreground shadow`): Dark navy fill, white text. Used for primary actions: "Sign in", "Create", "Save", "Add Transaction".
- **Destructive** (`bg-destructive text-destructive-foreground shadow-sm`): Red fill, white text. Used for "Delete", "Remove".
- **Outline** (`border border-input bg-background shadow-sm`): White fill, navy text, 1px border. Used for secondary actions: "Back", "Cancel", "Edit".
- **Secondary** (`bg-secondary text-secondary-foreground shadow-sm`): Light gray fill, navy text. Used for tertiary actions in dense areas.
- **Ghost** (`hover:bg-accent hover:text-accent-foreground`): No visible chrome until hover. Used for inline actions, icon buttons.
- **Link** (`text-primary underline-offset-4 hover:underline`): Text-only. Used for navigation links.

**States**: `hover` applies a 90% opacity shift (default variant) or background change. `focus-visible` shows a 1px ring in the foreground color. `disabled` sets `opacity-50` and `pointer-events-none`.

**Sizes**: Default (36px height, 16px horizontal padding), `sm` (32px, 12px), `lg` (40px, 32px), `icon` (36px × 36px square).

### Inputs & Fields

**Shape:** Gently curved (6px / `rounded-md`). 36px height (`h-9`). 1px cool-gray stroke (`border border-input`). Transparent background.

- **Default**: Cool-gray border, white background, navy text at 14px.
- **Placeholder**: `muted-foreground` (`#64748b`) — **verified to meet 4.5:1** against white background.
- **Focus**: Removes outline, applies a 1px solid ring in the foreground color (`focus-visible:ring-1 focus-visible:ring-ring`). No glow.
- **Disabled**: `opacity-50`, `cursor-not-allowed`.
- **Error**: Handled at the layout level (a red text message below the field), not by changing the input border. The input itself does not turn red.

### Cards / Containers

**Shape:** Generously curved (12px / `rounded-xl`). 1px cool-gray border. White fill. Subtle card shadow at rest.

- **Header**: 24px padding all sides, title separated from content by a vertical gap.
- **Title**: 16px, semibold, tight tracking, `leading-none`.
- **Content**: 24px padding on left/right/bottom (top is handled by the header).
- **Interactive cards** (account list, transaction rows): Add hover background shift (`hover:bg-muted/50`) and pointer cursor. Transition on `transition-colors`.

No nested cards. Card grids use `repeat(auto-fit, minmax(280px, 1fr))` for responsive layout without breakpoints.

### Dialog (Modal)

**Shape:** Generously curved on sm+ (8px / `sm:rounded-lg`), full-width on mobile. 80% black overlay. White fill, 24px padding, 1px border.

- Uses Radix Dialog primitives with Portal (escapes stacking context).
- Enter/exit animation: 200ms fade + zoom (95% → 100% scale).
- Close button: `opacity-70` at rest, `opacity-100` on hover, top-right position.
- Title: 18px semibold, `leading-none tracking-tight`.
- Description (optional): 14px `muted-foreground`.

### Navigation (Sidebar)

**Shape:** 256px fixed-width column, right-side 1px border. White fill (`bg-card`). Brand mark in the header area (24px padding) with the app name set in bold.

- **Nav items**: 14px font-medium. Default state: `muted-foreground` text. Active state: `bg-secondary text-secondary-foreground` (light gray background, navy text). Hover: same as active but without the background persisting.
- Each item carries a 16px Lucide icon in `text-muted-foreground`, matched to the text color.
- The logout button sits below a `border-t` separator in the sidebar footer.

### Theme Toggle

A sun/moon icon button in the top-right of the Header, 32px × 32px, `rounded-md`, `text-muted-foreground` with `hover:bg-secondary`. Displays a Sun icon when dark mode is active (click to switch to light) and a Moon icon when light mode is active (click to switch to dark). The preference persists in localStorage under `budgeteer_theme`.

### Header

A `border-bottom` strip, `bg-card`, 12px vertical padding, 24px horizontal padding. Contains the theme toggle on the left (or right, depending on layout) and the logged-in user's email in `text-muted-foreground` 14px text on the right.

### Transaction Rows (data display)

Compact rows with 12px rounded corners, 1px border, 12px internal padding. Each row shows:
- Amount (monospace `tabular-nums`, green for income, red for expense, with `+`/`-` prefix)
- Category pill (12px, `bg-secondary text-secondary-foreground`, 4px horizontal padding, `rounded-full`)
- Counterparty (14px `muted-foreground`, truncated on small screens)
- Date (12px `muted-foreground`, right-aligned)

## 6. Do's and Don'ts

### Do:

- **Do** use color only as an enhancement, never as the sole differentiator. Income/expense rows use `+`/`-` prefixes alongside green/red text.
- **Do** keep all interactive elements at 36px height for consistent touch targets.
- **Do** use the system font stack exclusively. No custom fonts, no icon fonts (use inline SVGs).
- **Do** verify `muted-foreground` (`#64748b`) against white (`#ffffff`) for 4.5:1 minimum contrast.
- **Do** use `focus-visible:ring-1 ring-ring` on every interactive element.
- **Do** keep form error messages as text below the field. Do not change the input border to red.
- **Do** skeleton-load content areas with the same surface tokens (muted gray). No spinners in the middle of content.
- **Do** respect `prefers-reduced-motion`: replace all animated transitions with instant (0ms) state changes.
- **Do** verify all color pairs in dark mode meet the same contrast ratios as light mode. The dark palette is not a mechanical inversion — each value is independently tuned.
- **Do** persist the user's theme preference to localStorage so the choice survives page reload.
- **Do** default to the system `prefers-color-scheme` on first visit.

### Don't:

- **Don't** use gradient text, colored accent stripes (`border-left` greater than 1px), or glassmorphism. Prohibited entirely.
- **Don't** use display or serif fonts anywhere in the UI. The system font stack is the only typeface.
- **Don't** add decorative motion. Motion conveys state only (hover, focus, open, close) and stays within 150–250ms.
- **Don't** use modals as the first thought for interaction. Exhaust inline and progressive disclosure patterns first.
- **Don't** use the primary navy on more than 10% of any single screen. Its rarity is the point.
- **Don't** create different button shapes or input styles on different pages. The component vocabulary is universal.
- **Don't** show "you're offline" banners that block interaction. A subtle indicator in the sidebar footer is sufficient.
- **Don't** use cards inside cards. A card is the outermost container; use direct child elements for internal grouping.
