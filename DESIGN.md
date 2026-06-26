---
name: Budgeteer
description: Collaborative offline-first personal finance tracker with E2E encryption
colors:
  background: "oklch(0.97 0.012 25)"
  foreground: "oklch(0.22 0.025 15)"
  card: "oklch(0.97 0.012 25)"
  card-foreground: "oklch(0.22 0.025 15)"
  popover: "oklch(0.97 0.012 25)"
  popover-foreground: "oklch(0.22 0.025 15)"
  primary: "oklch(0.40 0.06 260)"
  primary-foreground: "oklch(0.97 0.005 260)"
  secondary: "oklch(0.93 0.018 22)"
  secondary-foreground: "oklch(0.30 0.03 15)"
  muted: "oklch(0.93 0.018 22)"
  muted-foreground: "oklch(0.48 0.025 15)"
  accent: "oklch(0.91 0.022 25)"
  accent-foreground: "oklch(0.25 0.03 15)"
  destructive: "oklch(0.56 0.15 22)"
  destructive-foreground: "oklch(0.99 0.005 30)"
  border: "oklch(0.90 0.015 25)"
  input: "oklch(0.90 0.015 25)"
  ring: "oklch(0.40 0.06 260)"
  income: "oklch(0.48 0.1 150)"
  expense: "oklch(0.52 0.13 22)"
typography:
  body:
    fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  title:
    fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
  headline:
    fontFamily: '"Lora", Georgia, serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  display:
    fontFamily: '"Lora", Georgia, serif'
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1
rounded:
  base: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
neumorphic-shadows:
  raised-light: "-6px -6px 16px oklch(1 0 0), 6px 6px 16px oklch(0.835 0.015 25)"
  elevated-light: "-10px -10px 28px oklch(1 0 0), 10px 10px 28px oklch(0.835 0.015 25)"
  sunken-light: "inset 3px 3px 8px oklch(0.835 0.015 25), inset -3px -3px 8px oklch(1 0 0)"
  sunken-deep-light: "inset 5px 5px 12px oklch(0.835 0.015 25), inset -5px -5px 12px oklch(1 0 0)"
  raised-subtle-light: "-3px -3px 8px oklch(1 0 0), 3px 3px 8px oklch(0.835 0.015 25)"
  raised-color-light: "-5px -5px 14px oklch(1 0 0 / 0.5), 5px 5px 14px oklch(0 0 0 / 0.20)"
  raised-dark: "-8px -8px 14px oklch(0.13 0.01 340), 8px 8px 14px oklch(0.035 0.012 270)"
  elevated-dark: "-12px -12px 24px oklch(0.13 0.01 340), 12px 12px 24px oklch(0.035 0.012 270)"
  sunken-dark: "inset 4px 4px 8px oklch(0.035 0.012 270), inset -4px -4px 8px oklch(0.13 0.01 340)"
  sunken-deep-dark: "inset 6px 6px 12px oklch(0.035 0.012 270), inset -6px -6px 12px oklch(0.13 0.01 340)"
  raised-subtle-dark: "-4px -4px 7px oklch(0.13 0.01 340), 4px 4px 7px oklch(0.035 0.012 270)"
  raised-color-dark: "-6px -6px 12px oklch(0.13 0.01 340 / 0.4), 6px 6px 12px oklch(0 0 0 / 0.60)"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
    shadow: "raised-color"
    activeShadow: "sunken-deep"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
    shadow: "raised-color"
    activeShadow: "sunken-deep"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
    shadow: "raised"
    hoverShadow: "elevated"
    activeShadow: "sunken"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
    shadow: "raised"
    hoverShadow: "elevated"
    activeShadow: "sunken"
  input:
    backgroundColor: transparent
    rounded: "{rounded.base}"
    padding: "4px 12px"
    height: "36px"
    shadow: "sunken"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.base}"
    shadow: "raised"
  dialog:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.base}"
    shadow: "elevated"
---

# Design System: Budgeteer

## 1. Overview

**Creative North Star: "The Embossed Ledger"**

Budgeteer's interface is a cosy, tactile workspace where surfaces feel like they're pressed into or raised from a material surface — like embossed paper or soft leather. The neumorphic treatment gives every card, button, and input a subtle physicality: cards sit slightly proud of the page, inputs look gently recessed, and buttons press in when clicked.

Finance tracking is emotionally loaded; the UI should feel solid and trustworthy — like a well-bound ledger you can touch. The neumorphic shadows replace the cold delineation of borders with the warmth of depth.

**Key Characteristics:**
- **Hybrid neumorphic/flat system**: The `<Card>` component and elevated overlays (dialogs, drawers) use neumorphic dual shadows for depth. All other interactive elements — buttons, inputs, transaction rows — use a clean flat style with borders and subtle flat shadows. This prevents neumorphic over-application while keeping the card-based layout tactile.
- **Surface parity**: Cards and page share the same background colour. Depth comes from dual shadows (light highlight + dark shadow), not from colour differences.
- **Raised overlays**: Dialogs and drawers use an elevated dual shadow to float above the page. Cards use a subtle raised shadow.
- **Flat controls**: Buttons, inputs, and form controls use standard borders and background fills — no neumorphic treatment.
- **Dual-tone palette**: Light mode uses a warm rose-tinted near-white (L 0.97, hue 25°). Dark mode uses a very dark cool blue-gray (L 0.06, hue 270°) with warm purple-gray (#2C2427) shadow highlights — a deliberate warm/cool contrast that keeps shadows readable on the dark surface.
- **Dual-font system**: Lora (serif) for headings — editorial warmth; DM Sans (sans) for body — crisp scanning.
- **Subtle motion**: 150ms transitions on all state changes, including box-shadow transitions for the press/release animation.

## 2. Colors

The palette pairs warm rose-tinted neutrals with a cool slate blue accent — an intentional warm/cool contrast that avoids the sterility of all-cool financial tools while keeping the accent restrained and professional.

**Card surfaces now share the page background colour.** Neumorphism achieves depth not through lighter card fills but through dual shadows cast against the shared surface. This means cards are visually seamless with the page at rest — their "cardness" emerges from the shadow, not from a white fill.

### Light Mode

| Token              | OKLCH                              | Description                                           |
| :----------------- | :--------------------------------- | :---------------------------------------------------- |
| **Background**     | `oklch(0.97 0.012 25)`             | Warm rose-tinted surface — the material of the page   |
| **Foreground**     | `oklch(0.22 0.025 15)`             | Warm near-black — body text, headings, labels         |
| **Card / Popover** | `oklch(0.97 0.012 25)`             | Identical to background — depth via shadows only      |
| **Primary**        | `oklch(0.40 0.06 260)`            | Muted slate blue — primary buttons, active nav        |
| **Primary fg**     | `oklch(0.97 0.005 260)`           | Near-white text on primary surfaces                   |
| **Secondary**      | `oklch(0.93 0.018 22)`            | Deeper rose-tint — active states, secondary surfaces  |
| **Muted fg**       | `oklch(0.48 0.025 15)`            | Medium warm gray — secondary text, placeholders       |
| **Destructive**    | `oklch(0.56 0.15 22)`             | Desaturated terracotta — softer than harsh red        |
| **Border**         | `oklch(0.90 0.015 25)`            | Fine-detail dividers only (structural, not cards)     |
| **Ring**           | `oklch(0.40 0.06 260)`            | Matches primary — focus ring on interactive elements  |
| **Income**         | `oklch(0.48 0.1 150)`             | Soft sage green — income amounts                      |
| **Expense**        | `oklch(0.52 0.13 22)`             | Muted terracotta — expense amounts                    |

### Dark Mode

| Token              | OKLCH                               | Description                                               |
| :----------------- | :---------------------------------- | :-------------------------------------------------------- |
| **Background**     | `oklch(0.06 0.015 270)`            | Very dark cool blue-gray (#080D16) — the surface          |
| **Card / Popover** | `oklch(0.06 0.015 270)`            | Same as background — cards emerge via shadow               |
| **Foreground**     | `oklch(0.90 0.012 30)`             | Cool near-white — high contrast body text                 |
| **Primary**        | `oklch(0.62 0.07 260)`             | Light slate blue — readable against dark surfaces         |
| **Primary fg**     | `oklch(0.06 0.015 270)`            | Matches background — dark text on primary buttons         |
| **Secondary**      | `oklch(0.11 0.015 280)`            | Slightly lighter blue-gray for hover/active states        |
| **Muted fg**       | `oklch(0.55 0.015 25)`             | Medium gray — secondary text, placeholders                |
| **Destructive**    | `oklch(0.55 0.12 22)`              | Desaturated terracotta — reduced eye strain               |
| **Border**         | `oklch(0.15 0.012 280)`            | Subtle cool stroke for structural dividers                |
| **Ring**           | `oklch(0.62 0.07 260)`             | Matches dark-mode primary — visible focus indicator       |
| **Income**         | `oklch(0.65 0.1 150)`             | Muted sage green for dark mode                            |
| **Expense**        | `oklch(0.62 0.12 22)`              | Muted terracotta for dark mode                            |

### Semantic Meaning

- **Primary** (slate blue) is used for call-to-action buttons, active navigation indicators, and the brand mark. It appears on no more than 10% of any screen — its rarity is the point.
- **Destructive** (desaturated terracotta) replaces harsh `#ef4444` red. It conveys removal without alarm.
- **Income / Expense** colors are informational only, always accompanied by `+`/`-` prefixes.

## 3. Neumorphic Shadows

All depth is created by dual shadows — a light highlight (top-left, from the light source) and a dark shadow (bottom-right). These are defined as CSS custom properties and used via utility classes.

### Utility Classes

All shadows follow the same formula: the highlight colour (top-left) is pure white in light mode / a lighter version of the background in dark mode; the shadow colour (bottom-right) is a darker version of the background at the same hue. Background and card surfaces are identical — depth comes from shadow contrast alone.

Light-mode offset-to-blur ratio is approximately 1:2.7. Dark mode uses a slightly larger offset with a smaller blur so shadows stay crisp against a dark substrate, while keeping overall distances modest so the effect doesn't overwhelm the layout.

| Utility | Light Mode | Dark Mode | Use Case |
| :------ | :--------- | :-------- | :------- |
| `raised` | `-6px -6px 16px oklch(1 0 0), 6px 6px 16px oklch(0.835 0.015 25)` | `-8px -8px 14px oklch(0.13 0.01 340), 8px 8px 14px oklch(0.035 0.012 270)` | Default card elevation, outline buttons |
| `elevated` | `-10px -10px 28px oklch(1 0 0), 10px 10px 28px oklch(0.835 0.015 25)` | `-12px -12px 24px oklch(0.13 0.01 340), 12px 12px 24px oklch(0.035 0.012 270)` | Modals, dialogs, dropdowns |
| `sunken` | `inset 3px 3px 8px oklch(0.835 0.015 25), inset -3px -3px 8px oklch(1 0 0)` | `inset 4px 4px 8px oklch(0.035 0.012 270), inset -4px -4px 8px oklch(0.13 0.01 340)` | Inputs, active nav items |
| `sunken-deep` | `inset 5px 5px 12px oklch(0.835 0.015 25), inset -5px -5px 12px oklch(1 0 0)` | `inset 6px 6px 12px oklch(0.035 0.012 270), inset -6px -6px 12px oklch(0.13 0.01 340)` | Button pressed (active) state |
| `raised-subtle` | `-3px -3px 8px oklch(1 0 0), 3px 3px 8px oklch(0.835 0.015 25)` | `-4px -4px 7px oklch(0.13 0.01 340), 4px 4px 7px oklch(0.035 0.012 270)` | Transaction rows, small elements |
| `raised-color` | `-5px -5px 14px oklch(1 0 0 / 0.5), 5px 5px 14px oklch(0 0 0 / 0.20)` | `-6px -6px 12px oklch(0.13 0.01 340 / 0.4), 6px 6px 12px oklch(0 0 0 / 0.60)` | Primary/destructive filled buttons |

### Interaction States (Cards & Overlays)

- **Rest**: Card uses `raised` shadow. Dialog/drawer use `elevated` shadow.
- **Hover**: Interactive cards intensify (`raised` → `elevated`).
- **Active (pressed)**: N/A for cards (no press state).
- **Focus-visible**: 1px ring in `--color-ring`, no glow.

Non-card elements (buttons, inputs, transaction rows) use standard flat hover/active transitions (background colour, border colour) — no shadow changes.

## 4. Typography

Same as the previous design — no changes to the type system.

**A purposeful pairing:** Lora (serif) for display and headline roles + DM Sans (sans-serif) for body, labels, buttons, and data.

### Hierarchy

| Role      | Family   | Weight | Size         | Line Height |
| :-------- | :------- | :----- | :----------- | :---------- |
| **Display**  | Lora    | 600    | 1.875rem     | 1.2         |
| **Headline** | Lora    | 600    | 1.25rem      | 1.2         |
| **Title**    | DM Sans | 600    | 1rem         | 1           |
| **Body**     | DM Sans | 400    | 0.9375rem    | 1.6         |
| **Label**    | DM Sans | 500    | 0.875rem     | 1           |
| **Small**    | DM Sans | 400    | 0.75rem      | 1.5715      |

## 5. Components

### Buttons

**Shape:** Gently curved (10px). All variants share the same radius and height (36px). Flat minimal style — no neumorphic shadows.

- **Default** (`bg-primary text-primary-foreground shadow-sm hover:bg-primary/90`): Slate blue fill with a subtle flat shadow. Darkens on hover.
- **Destructive** (`bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90`): Terracotta fill with the same behaviour.
- **Outline** (`border border-input bg-background text-foreground hover:bg-secondary hover:text-secondary-foreground`): Flat border-only button. No shadow.
- **Secondary** (`bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`): Tinted fill with subtle flat shadow.
- **Ghost** (`hover:bg-secondary hover:text-secondary-foreground`): No chrome until hover.
- **Link** (`text-primary underline-offset-4 hover:underline`): Text-only.

### Inputs

**Shape:** Gently curved (10px). 36px height. Flat minimal style — no inset shadows.

Inputs use a standard flat border (`border border-input`) and a transparent-to-background fill. No neumorphic treatment.

- **Default**: `bg-background border border-input`, 1px ring on focus.
- **Placeholder**: `muted-foreground` — 4.5:1 contrast verified.
- **Focus**: `focus-visible:ring-1 focus-visible:ring-ring` — no glow.
- **Disabled**: `opacity-50`, `cursor-not-allowed`.

### Cards

**Shape:** Gently curved (10px). No border.

Cards share the page background colour. Their depth comes from the `raised` 6px/16px dual shadow — a pure white highlight on the top-left, a warm rose-gray shadow on the bottom-right. This creates the illusion of a surface element resting clearly above the page.

- **Header**: 24px padding, title separated from content by a vertical gap.
- **Content**: 24px padding on left/right/bottom (top handled by header).
- **Interactive cards**: Add `hover:elevated` (10px/28px) and `transition-all`.
- **Card grids**: `repeat(auto-fit, minmax(280px, 1fr))` for responsive layout.

### Dialog (Modal)

**Shape:** Gently curved on sm+ (10px), full-width on mobile. 80% black overlay.

Dialogs use the `elevated` 10px/28px shadow — the strongest raise — to float clearly above the overlay. No border.

- Radix Dialog Portal escapes stacking context.
- Enter/exit: 200ms fade + zoom.
- Close button: `opacity-70` at rest, `opacity-100` on hover, top-right.

### Navigation (Sidebar)

**Shape:** 256px fixed-width column. Uses `border-r border-border/30` as a subtle structural divider (the 30% opacity keeps it gentle).

- Nav items use `bg-secondary` for the active state (flat highlight), and `hover:bg-secondary` for hover.
- Theme toggle uses a simple `bg-secondary` track with a `shadow-sm` thumb — no neumorphic treatment.

### Header

A shadow-based separator replaces the former bottom border: `shadow-[0_1px_3px_-2px_rgba(0,0,0,0.08)]`. The header and content share the same background — the shadow subtly lifts the header above the page.

### Bottom Navigation (Mobile)

Same treatment as the header but inverted: `shadow-[0_-1px_3px_-2px_rgba(0,0,0,0.08)]` lifts the bar above content.

### Transaction Rows

Compact rows with 10px rounded corners. Flat minimal style — uses `border border-border/50` for separation instead of shadows. Hover (when interactive) intensifies the border via `hover:border-border`.

## 6. Do's and Don'ts

### Do:

- **Do** maintain surface parity: cards and dialogs should match the page background. Depth comes from shadows, not colour.
- **Do** use the correct shadow direction: raised elements have light top-left, dark bottom-right. Sunken elements invert this.
- **Do** keep all interactive elements at 36px height for consistent touch targets.
- **Do** verify all text contrast meets WCAG 2.1 AA (4.5:1 body, 3:1 large text).
- **Do** verify all shadow pairs maintain sufficient affordance — raised elements should look clearly raised, not muddy.
- **Do** respect `prefers-reduced-motion`: replace all animated transitions with instant state changes.
- **Do** use `focus-visible:ring-1 ring-ring` on every interactive element.
- **Do** use `transition-all` on elements that change shadow states (hover, active) so the press feels tactile.
- **Do** keep the warm rose-tinted palette consistent — it's the material of the application.

### Don't:

- **Don't** use gradient text, colored accent stripes (border-left > 1px), or glassmorphism. Prohibited entirely.
- **Don't** add borders to cards or dialogs — depth replaces strokes on those surfaces.
- **Don't** add neumorphic shadows to buttons, inputs, or transaction rows — those are deliberately flat.
- **Don't** mix neumorphic shadows on flat elements. Card = neumorphic, controls = flat.
- **Don't** use the primary accent on more than 10% of any single screen. Its rarity is the point.
- **Don't** change the income/expense colors (sage green / muted terracotta) — those are fixed semantic signals.
- **Don't** use modals as the first thought for interaction. Exhaust inline and progressive disclosure patterns first.
- **Don't** override the font pairing — DM Sans on body, Lora on headings.
- **Don't** create separate component vocabularies on different pages. The neumorphic system is universal.
- **Don't** use cards inside cards. A card is the outermost container — use direct child elements for internal grouping.
