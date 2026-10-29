# Veda Design System

Dark-first, VS-Code-grade developer tool. Flat panels, hairline borders, one indigo accent, tonal layers instead of shadows.
Light theme is designed separately (not an inversion). The theme is set on `<html data-theme="dark|light">` by an inline script
before first paint and saved in `localStorage` key `veda-theme`.

Sources: the UI UX Pro Max skill data (style "Dark Mode + Minimalism & Swiss", product row "Developer Tool / IDE"),
with contrast ratios computed for every text pair (minimum 4.5:1 for body text, 3:1 for control borders).

## Rules

1. Use semantic utilities only. No raw hex in components. No `neutral-*`, `slate-*`, `gray-*` classes.
2. One icon family: `lucide-react`. No emoji or glyph icons. Sizes: 14 or 16 in IDE chrome, 18 or 20 in dashboard, 24 on marketing pages.
   Decorative icons next to text get `aria-hidden="true"`. Icon-only buttons need `aria-label`.
3. Every clickable element has `hover`, `focus-visible`, `active` and `disabled` states in both themes. The base layer sets the focus ring and `cursor: pointer`.
4. Status is never color alone: pair color with an icon or a word.
5. Numbers (balances, prices, line numbers) use `.tnum` (tabular figures). Money uses `Intl.NumberFormat("en-IN")`.
6. Animate only `transform` and `opacity`. Durations 80 / 120 / 200 / 320 ms. `prefers-reduced-motion` is handled globally in `globals.css`.
7. Touch targets are 44px on marketing and dashboard pages on mobile. Dense IDE chrome may use 24 to 32px with 8px gaps.
8. Test at 375, 768, 1024 and 1440 px. No horizontal scroll at any width.
9. Fonts come from `next/font` only (the `/ide` route sends COEP `require-corp`; never add cross-origin links there).

## Tokens (`src/app/globals.css`)

| Utility | Dark | Light | Use |
|---|---|---|---|
| `bg-app` | `#0B0D12` | `#F6F7F9` | Window background, activity bar, status bar |
| `bg-panel` | `#11141B` | `#FFFFFF` | Sidebar, terminal, chat, cards |
| `bg-elevated` | `#181C25` | `#FFFFFF` | Hovered rows, tab bar, popovers |
| `bg-overlay` | `#1F242F` | `#FFFFFF` | Dialogs, command palette, menus |
| `bg-editor` | `#0D1017` | `#FFFFFF` | Editor surface |
| `bg-sunken` | `#181C25` | `#EEF0F4` | Inputs, tab strip |
| `border-line` | `#262B37` | `#E3E6EC` | Seams and dividers |
| `border-line-strong` | `#343B4A` | `#D3D8E0` | Card borders |
| `border-control` | `#66718A` | `#7B8599` | Input borders (3:1 or more) |
| `text-fg` / `text-fg-2` / `text-fg-3` | `#E6E9F0` / `#A3ACBD` / `#8892A6` | `#0F172A` / `#475569` / `#5B6678` | Primary, secondary, muted text |
| `bg-accent` + `text-accent-fg` | `#5B5FEF` + white | `#4F46E5` + white | Primary action |
| `text-accent-text` | `#818CF8` | `#4F46E5` | Links, accent text |
| `bg-accent-subtle` | indigo 14% | indigo 8% | Selected row, active tab |
| `text-success` `text-warning` `text-danger` `text-info` | `#4ADE80` `#FBBF24` `#F87171` `#60A5FA` | `#15803D` `#B45309` `#B91C1C` `#1D4ED8` | Status. Each has a `*-subtle` background. |
| `outline-ring` | `#A5B4FC` | `#4F46E5` | Focus ring (2px, offset 2px) |
| `shadow-e1` / `e2` / `e3` / `glow` | | | Card, menu, dialog, landing hero |

Fonts: `font-sans` (Inter plus Noto Sans Devanagari, Bengali and Tamil fallbacks), `font-display` (Space Grotesk, headings and numbers),
`font-mono` (JetBrains Mono). Extra sizes: `text-ui` (13px), `text-caption` (12px), `text-overline` (11px, uppercase labels only).
Motion: `animate-fade-in`, `animate-slide-up`, `animate-scale-in`, `animate-dot-pulse`, `.skeleton` (shimmer).

## Components (`src/components/ui/`)

| File | Exports |
|---|---|
| `button.tsx` | `Button` (variants `primary` `secondary` `ghost` `danger` `success`; sizes `xs` `sm` `md` `lg` `icon-sm` `icon` `icon-lg`; `loading`, `leadingIcon`), `buttonStyles()` for links |
| `field.tsx` | `Field` (label, hint, error, render prop), `Input`, `Select`, `Textarea`, `controlClass` |
| `card.tsx` | `Card`, `cardClass`, `SectionLabel` |
| `badge.tsx` | `Badge` (tones `neutral` `accent` `success` `warning` `danger` `info`) |
| `dialog.tsx` | `Dialog` (native `<dialog>`: focus trap, Escape, backdrop click, focus restore) |
| `kbd.tsx`, `skeleton.tsx`, `logo.tsx` | `Kbd`, `Skeleton`, `Logo`, `LogoMark` |
| `theme.tsx` | `ThemeToggle`, `useTheme()`, `setTheme()` (use `useTheme()` for Monaco and xterm themes) |

## Type scale

| Role | Size / line height | Weight | Font |
|---|---|---|---|
| Display (hero) | `clamp(40px, 6vw, 68px)` / 1.05 | 700, tracking -0.03em | Space Grotesk |
| H1 / H2 / H3 | 36 / 28 / 20 | 600 | Space Grotesk (H3 Inter) |
| Body | 16 / 1.6 | 400 | Inter |
| IDE chrome | 13 / 1.4 | 400 to 500 | Inter |
| Caption | 12 / 1.4 | 400 to 500 | Inter |
| Overline | 11, uppercase, tracking 0.08em | 600 | Inter |
| Code | 14 / 1.6 | 400 | JetBrains Mono |

## Layout

- Container: `max-w-6xl` (1152px) with 16px side padding on mobile, 24px from 768px.
- Spacing: 4px base. IDE bars: toolbar 40px, tab 36px, status bar 24px, tree row 24px.
- Radius: 4 (chips, tree rows), 6 (buttons, inputs), 8 (menus), 12 (dashboard cards), 16 (marketing tiles).
- z-index: 10 sticky bars, 20 resize handles, 40 menus, 100 dialogs, 1000 toasts and command palette.
- IDE shell uses `100dvh`. Below 768px the IDE shows a "best on a larger screen" notice.

## Pre-delivery checklist

- [ ] No emoji icons. One icon family. Sizes follow the rules above.
- [ ] Semantic tokens only. Both themes checked.
- [ ] Focus ring visible on every control. Keyboard order matches visual order.
- [ ] Contrast: body text 4.5:1, control borders 3:1, in dark and in light.
- [ ] 375 / 768 / 1024 / 1440 px: no horizontal scroll, no clipped text.
- [ ] Empty, loading (skeleton) and error state for every async region.
- [ ] `prefers-reduced-motion: reduce` shows the final state with no motion.
