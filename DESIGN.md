---
name: Budgeteer
description: Collaborative offline-first personal finance tracker with E2E encryption
colors:
  background: "oklch(0.985 0.008 30)"
  foreground: "oklch(0.22 0.025 15)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.22 0.025 15)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.22 0.025 15)"
  primary: "oklch(0.40 0.06 260)"
  primary-foreground: "oklch(0.97 0.005 260)"
  secondary: "oklch(0.95 0.018 20)"
  secondary-foreground: "oklch(0.30 0.03 15)"
  muted: "oklch(0.95 0.018 20)"
  muted-foreground: "oklch(0.48 0.025 15)"
  accent: "oklch(0.93 0.025 30)"
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
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
  button-default-hover:
    backgroundColor: "{colors.primary}"
    opacity: 0.9
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.base}"
    border: "1px solid {colors.input}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: transparent
    border: "1px solid {colors.input}"
    rounded: "{rounded.base}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.base}"
    border: "1px solid {colors.border}"
    padding: "24px"
  dialog:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.base}"
    border: "1px solid {colors.border}"
    padding: "24px"
---

# Design System: Budgeteer

## 1. Overview

**Creative North Star: "The Warm Ledger"**

Budgeteer's interface is a cosy, ordered workspace where the numbers do the talking. Like a well-worn leather-bound ledger in a quiet study: warm parchment tones, soft rose accents, and typography that feels crafted but never precious. The palette leans into warm neutrals with a subtle rose tint — near-white backgrounds with a blush warmth, soft dusty rose for primary actions, and desaturated terracotta for destructive signals. It's a pastel-adjacent warmth without tipping into neobank playfulness.

Finance tracking is emotionally loaded; the UI should feel like a trustworthy accountant who pours you a tea, not a dashboard designed to maximize engagement. The warm palette reduces the clinical sterility of most finance tools while maintaining precision and clarity.

The product register means this is a tool first. Users sit down to log a transaction, review spending, or invite a household member — and the UI should disappear into that task, warmly.

**Key Characteristics:**
- Warm neutral palette: rose-tinted light surfaces (hue ~20-30°, chroma < 0.025) with a dusty rose primary accent.
- Dual-font system: Lora (serif) for headings gives a cosy, editorial feel; DM Sans (humanist sans) for body ensures fast, legible scanning.
- Flat by default, layered with purpose: tonal stacking for depth; shadows reserved for interactive states and modals.
- Consistent component vocabulary across every screen. A button is a button; an input is an input. No surprises.
- Generous whitespace (24px padding on cards, 24px sidebar padding, 24px page margins) punctuated by dense data rows.
- Thoughtful motion: 150ms transitions on state changes for a polished feel.

## 2. Colors

The palette pairs warm rose-tinted neutrals with a cool slate blue accent — an intentional warm/cool contrast that avoids the sterility of all-cool financial tools while keeping the accent restrained and professional. Neutrals sit in the warm hue range (12°–30°), while the primary accent sits in the cool blue range (260°). This contrast gives personality without sacrificing clarity.

**Dual-mode system.** The UI supports both light and dark themes via a `.dark` class toggle on `<html>`. The dark mode is not an inversion — warm deep-brown neutrals replace the background (L 0.16, hue 15°), cards lift slightly (L 0.20) for surface distinction, and the primary accent lightens to a blush rose (L 0.72) for readability against dark backgrounds. Theme preference is persisted to localStorage (`budgeteer_theme`) and defaults to the system `prefers-color-scheme`. A sun/moon toggle in the header lets users switch at any time.

### Light Mode

| Token              | OKLCH                              | Description                                           |
| :----------------- | :--------------------------------- | :---------------------------------------------------- |
| **Background**     | `oklch(0.985 0.008 30)`            | Near-white with a whisper of rose warmth              |
| **Foreground**     | `oklch(0.22 0.025 15)`             | Warm near-black — body text, headings, labels         |
| **Card / Popover** | `oklch(1 0 0)`                     | Pure white card surfaces — distinction by border only |
| **Primary**        | `oklch(0.40 0.06 260)`            | Muted slate blue — primary buttons, active nav        |
| **Primary fg**     | `oklch(0.97 0.005 260)`           | Near-white text on primary surfaces                   |
| **Secondary**      | `oklch(0.95 0.018 20)`            | Blush-tinted light surface — sidebar, hover states    |
| **Muted fg**       | `oklch(0.48 0.025 15)`            | Medium warm gray — secondary text, placeholders       |
| **Destructive**    | `oklch(0.56 0.15 22)`             | Desaturated terracotta — softer than harsh red        |
| **Border / Input** | `oklch(0.90 0.015 25)`            | Soft rose-gray stroke — card borders, dividers         |
| **Ring**           | `oklch(0.40 0.06 260)`            | Matches primary — focus ring on interactive elements  |
| **Income**         | `oklch(0.48 0.1 150)`             | Soft sage green — income amounts                      |
| **Expense**        | `oklch(0.52 0.13 22)`             | Muted terracotta — expense amounts                    |

### Dark Mode

The `.dark` class overrides every token. Key differences from light mode:

| Token              | OKLCH                              | Description                                            |
| :----------------- | :--------------------------------- | :----------------------------------------------------- |
| **Background**     | `oklch(0.16 0.02 15)`             | Deep warm brown-gray — not black                       |
| **Card / Popover** | `oklch(0.20 0.022 15)`            | Slightly lighter for surface distinction               |
| **Foreground**     | `oklch(0.93 0.012 30)`            | Warm near-white — high contrast body text              |
| **Primary**        | `oklch(0.60 0.06 260)`            | Light slate blue — readable against dark surfaces      |
| **Primary fg**     | `oklch(0.14 0.02 260)`            | Dark text on primary buttons                           |
| **Secondary**      | `oklch(0.26 0.025 15)`            | Dark warm surface for hover/active states              |
| **Muted fg**       | `oklch(0.62 0.02 20)`             | Brighter than light mode — legible against dark bg     |
| **Destructive**    | `oklch(0.60 0.14 22)`             | Slightly desaturated terracotta — reduced eye strain   |
| **Border / Input** | `oklch(0.30 0.025 15)`            | Subtle warm stroke separating surfaces                 |
| **Ring**           | `oklch(0.60 0.06 260)`            | Matches dark-mode primary — visible focus indicator    |
| **Income**         | `oklch(0.68 0.1 150)`            | Brighter sage green for dark mode                      |
| **Expense**        | `oklch(0.68 0.12 22)`             | Brighter terracotta for dark mode                      |

### Semantic Meaning

- **Primary** (slate blue) is used for call-to-action buttons, active navigation indicators, and the brand mark. It appears on no more than 10% of any screen — its rarity is the point. The default is a cool slate blue, but users can customize it from Settings.
- **Destructive** (desaturated terracotta) replaces harsh `#ef4444` red. It conveys removal without alarm.
- **Income / Expense** colors are informational only, always accompanied by `+`/`-` prefixes. Income is sage green; expense is muted terracotta.

## 3. Typography

**A purposeful pairing:** Lora (serif) for display and headline roles + DM Sans (sans-serif) for body, labels, buttons, and data.

This is a deliberate departure from the single-family stack typical of product UIs. The warmth of Lora's bracketed serifs and generous proportions adds an editorial, trustworthy character to headings — the visual equivalent of a well-set financial report. DM Sans provides the crisp legibility required for dense data scanning, form labels, and transaction amounts. The pairing sits on a contrast axis: serif (humanist/old-style) vs. geometric humanist sans.

### Font Loading

Both fonts are loaded from Google Fonts with `display=swap` and `preconnect` hints for minimal layout shift. Lora is limited to weights 500 and 600; DM Sans to 400, 500, and 600 — no unnecessary weight variants.

### Hierarchy

| Role      | Family   | Weight | Size         | Line Height | Usage                                   |
| :-------- | :------- | :----- | :----------- | :---------- | :-------------------------------------- |
| **Display**  | Lora    | 600    | 1.875rem     | 1.2         | Page-level headings — one per page      |
| **Headline** | Lora    | 600    | 1.25rem      | 1.2         | Section headings, card & dialog titles  |
| **Title**    | DM Sans | 600    | 1rem         | 1           | Sub-section headers, card titles        |
| **Body**     | DM Sans | 400    | 0.9375rem    | 1.6         | Primary reading — amounts, descriptions |
| **Label**    | DM Sans | 500    | 0.875rem     | 1           | Form labels, button text, nav items     |
| **Small**    | DM Sans | 400    | 0.75rem      | 1.5715      | Dates, secondary metadata               |

- **Display size** is clamped at 1.875rem — never larger. The app is not a landing page.
- **Letter spacing** on headings: `-0.01em` — tight enough for character, open enough for legibility at display sizes.
- **`text-wrap: balance`** on all h1–h3 (Lora headings) for even line lengths.
- **Body line length** capped at 65–75ch for prose; data tables may run denser.
- **14px body** was bumped to **15px** (`0.9375rem`) — a slightly more generous read that matches the warmer, more comfortable feel.

## 4. Elevation & Motion

Flat by default, layered with purpose. Tonal color separation distinguishes surfaces; shadows are reserved for interactive and modal states.

### The Flat-By-Default Rule

Surfaces sit on the same z-plane until an interaction or structural need lifts them. Sidebars and content panels are distinguished by background color and a 1px border, not by a drop shadow.

### Shadow Vocabulary

- **Card shadow** (`shadow-sm`): `0 1px 2px 0 rgb(0 0 0 / 0.05)` — default card surface elevation.
- **Dialog overlay**: `rgba(0,0,0,0.8)` behind modals. Dialog content carries `shadow-lg`.
- **Hover lift**: Interactive cards lift with `hover:shadow-md` and `transition-shadow`.
- **Focus ring**: `focus-visible:ring-1 focus-visible:ring-ring` — crisp colored outline, no glow.

### Motion

- **State transitions**: 150ms ease on `background-color`, `border-color`, `color`, `opacity`, `box-shadow`. Applied globally via a universal selector default.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` sets `transition: none` on all elements.
- **Dialog enter/exit**: 200ms fade + zoom (95% → 100% scale). Radix Dialog handles this via data attributes.

## 5. Components

All components are Shadcn UI primitives (Radix-based) styled via Tailwind CSS v4 `@theme` tokens. The following is the canonical vocabulary.

### Buttons

**Shape:** Gently curved (0.625rem / 10px via `rounded-md`). All variants share the same radius and height (36px / `h-9`).

- **Default** (`bg-primary text-primary-foreground shadow`): Slate blue fill, near-white text.
- **Destructive** (`bg-destructive text-destructive-foreground shadow-sm`): Terracotta fill, warm white text.
- **Outline** (`border border-input bg-background shadow-sm`): Near-white fill, warm dark text, 1px rose-gray border.
- **Secondary** (`bg-secondary text-secondary-foreground shadow-sm`): Blush-tinted fill, warm dark text.
- **Ghost** (`hover:bg-accent hover:text-accent-foreground`): No chrome until hover.
- **Link** (`text-primary underline-offset-4 hover:underline`): Text-only navigation links.

**States:** `hover` applies opacity shift or background change. `focus-visible` shows a 1px ring in the primary color. `disabled` sets `opacity-50` and `pointer-events-none`.

**Sizes:** Default (36px), `sm` (32px), `lg` (40px), `icon` (36px × 36px).

### Inputs & Fields

**Shape:** Gently curved (10px). 36px height. 1px rose-gray stroke. Transparent background.

- **Default**: Rose-gray border, warm dark text at 15px (14px on sm screens).
- **Placeholder**: `muted-foreground` — verified to meet 4.5:1 against background.
- **Focus**: `focus-visible:ring-1 focus-visible:ring-ring` — no glow.
- **Disabled**: `opacity-50`, `cursor-not-allowed`.
- **Error**: Handled as text below the field — input border does not change color.

### Cards / Containers

**Shape:** Gently curved (10px). 1px rose-gray border. Pure white fill. Subtle card shadow at rest.

- **Header**: 24px padding, title separated from content by a vertical gap.
- **Title**: 16px, DM Sans semibold, `leading-none`.
- **Content**: 24px padding on left/right/bottom (top handled by header).
- **Interactive cards**: Add `hover:bg-muted/50` and pointer cursor.
- **Card grids**: `repeat(auto-fit, minmax(280px, 1fr))` for responsive layout.

### Dialog (Modal)

**Shape:** Gently curved on sm+ (10px), full-width on mobile. 80% black overlay. Warm near-white fill, 24px padding, 1px rose-gray border.

- Radix Dialog Portal escapes stacking context.
- Enter/exit: 200ms fade + zoom.
- Close button: `opacity-70` at rest, `opacity-100` on hover, top-right.
- Title: 18px Lora semibold, `leading-none tracking-tight`.
- Description: 14px `muted-foreground`.

### Navigation (Sidebar)

**Shape:** 256px fixed-width column, right-side 1px border. Blush-tinted fill (`bg-card`). Brand mark in header area (24px padding) with the app name set in Lora semibold.

- **Nav items**: 14px DM Sans medium. Default: `muted-foreground`. Active: `bg-secondary text-secondary-foreground` (blush tint, warm dark text). Hover: same without persistence.
- Each item carries a 16px Lucide icon in `text-muted-foreground`.
- Logout sits below a `border-t` separator in the sidebar footer.

### Transaction Rows (data display)

Compact rows with 10px rounded corners, 1px border, 12px internal padding. Each row shows:
- Amount (DM Sans `tabular-nums`, sage green for income, terracotta for expense, with `+`/`-` prefix)
- Category pill (12px, `bg-secondary text-secondary-foreground`, `rounded-full`)
- Counterparty (14px `muted-foreground`, truncated on small screens)
- Date (12px `muted-foreground`, right-aligned)

### Theme Toggle

A sun/moon icon button in the top-right of the Header, 32px × 32px, `rounded-md`, `text-muted-foreground` with `hover:bg-secondary`. Sun icon shown in dark mode; Moon icon shown in light mode. Preference persists in `localStorage`.

### Header

`border-bottom` strip, `bg-card`, 12px vertical padding, 24px horizontal padding. Contains theme toggle and logged-in user email in `text-muted-foreground`.

## 6. Do's and Don'ts

### Do:

- **Do** use the warm rose-tinted palette consistently. The background's subtle warmth carries the brand.
- **Do** use Lora for headings (h1–h3) and DM Sans for body — this pairing is intentional and must stay consistent.
- **Do** keep all interactive elements at 36px height for consistent touch targets.
- **Do** verify `muted-foreground` (`oklch(0.48 0.025 15)`) against `background` for 4.5:1 minimum contrast.
- **Do** use `focus-visible:ring-1 ring-ring` on every interactive element.
- **Do** keep form error messages as text below the field. Do not change the input border to red.
- **Do** skeleton-load content areas with the same surface tokens. No spinners.
- **Do** respect `prefers-reduced-motion`: replace all animated transitions with instant state changes.
- **Do** verify all color pairs in dark mode meet the same contrast ratios as light mode.
- **Do** persist the user's theme preference to localStorage so the choice survives page reload.
- **Do** default to the system `prefers-color-scheme` on first visit.

### Don't:

- **Don't** use gradient text, colored accent stripes (`border-left` greater than 1px), or glassmorphism. Prohibited entirely.
- **Don't** add decorative motion. Motion conveys state only (hover, focus, open, close) and stays within 150–250ms.
- **Don't** use modals as the first thought for interaction. Exhaust inline and progressive disclosure patterns first.
- **Don't** use the primary accent on more than 10% of any single screen. Its rarity is the point.
- **Don't** change the income/expense colors (sage green / muted terracotta) — those are fixed semantic signals, not accent-linked.
- **Don't** create different button shapes or input styles on different pages. The component vocabulary is universal.
- **Don't** show "you're offline" banners that block interaction. A subtle indicator in the sidebar footer is sufficient.
- **Don't** use cards inside cards. A card is the outermost container; use direct child elements for internal grouping.
- **Don't** override the font pairing — DM Sans on body, Lora on headings. Neither font should appear in the other's role.
