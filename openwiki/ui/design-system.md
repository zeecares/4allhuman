---
type: ui
title: Design System & Root Layout
description: The Teenage Engineering-inspired CSS design system in src/app/globals.css, the root layout in src/app/layout.tsx, and the Next.js App Router conventions that frame the single client page.
tags: [ui, css, design-system, layout, nextjs, app-router]
---

# Design System & Root Layout

The visual surface of **Don't Train On Me** is a single CSS file (`src/app/globals.css`) plus a minimal root layout (`src/app/layout.tsx`). The design system is an intentional Teenage Engineering industrial aesthetic — flat panels, hard edges, warm-grey chassis, signature orange accents, monospace labels, LED status indicators, and numbered modules — chosen to read as "instruments, not marketing" and to reinforce the [trust principles](../architecture/overview.md#lifecycle-and-trust) (verifiability, honest limits, no black boxes).

## Root layout — `src/app/layout.tsx`

The App Router root layout is the smallest file in the app:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Don't Train On Me",
  description: "Protect any creator's content from AI training in 60 seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

It provides the `<html lang="en">` / `<body>` shell, sets the document `<title>` and meta description, and imports `globals.css` so the design system applies to the whole tree. `children` is the [scan UI page](../ui/page.md) rendered by `page.tsx`. The layout is a server component (no `"use client"`), so it ships no client JS; only the page is a client component.

## Design tokens — `:root`

The system is built on CSS custom properties in `:root`:

| Token | Value | Role |
|---|---|---|
| `--bg` | `#e8e6e1` | "unit chassis" — page background |
| `--panel` | `#f4f3ef` | "faceplate" — card surface |
| `--panel-dark` | `#d9d7d1` | recessed panel / card header |
| `--ink` | `#1a1a18` | "printed ink" — primary text + code background |
| `--muted` | `#8a887f` | secondary text, notes, labels |
| `--orange` | `#ff4b00` | TE knob orange — accents, scan button, focus |
| `--green` | `#0ba84a` | LED green — "blocked" / good score |
| `--red` | `#e03131` | LED red — "CAN TRAIN" / error |
| `--line` | `#1a1a18` | 2px hard borders |

Everything is monospace (`ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`) with tight letter-spacing. The whole system uses `border-radius: 0` (hard edges) except the circular LED dots.

## Component classes

These are the classes the [page component](../ui/page.md) uses. Each maps to a distinct instrument panel:

### Layout
- `main` — `max-width: 980px`, centered, `padding: 40px 24px 96px`.
- `h1` — 3px bottom border, uppercase, 800 weight; `.shield` span is orange.
- `.tagline` — muted, 0.8rem, uppercase.
- `footer` — 2px top border, muted, links orange.

### Scan input
- `.scan-form` — flex row; `input` is a 2px-bordered faceplate with an inset bottom shadow, orange `:focus` outline; `button` is the orange scan key with a 3px `box-shadow` that flattens on `:active` (a physical key press).
- `.examples` / `.example-btn` — "or try:" row of bordered, uppercase example buttons.

### Numbered modules — `.card`
The signature instrument panel: a 2px-bordered faceplate with a recessed `--panel-dark` header (`h2`) carrying an orange `.num` and an uppercase label. The body sits in `.card .body` (`padding: 16px`). The header uses `justify-content: space-between` so the right-aligned muted timestamp / copy button sit at the end.

### Score LCD — `.score-big`
A black (`--ink`) block with a large number and a tiny uppercase `.score-sub` label. Color is driven by `.score-good` (green), `.score-mid` (`#ffd60a` yellow), `.score-bad` (orange). The `.breakdown` is a dashed-divider list of `label / got-max` rows.

### Crawler LED matrix — `.crawler-grid` / `.chip`
An auto-filling grid (`repeat(auto-fill, minmax(215px, 1fr))`) of `.chip` rows. Each chip has a 10px circular `.led` (green + glow when `.blocked`, red + glow when `.open`) and a `.state` label (`BLOCKED` / `CAN TRAIN`).

### Punched-tape code — `pre`
A black `--ink` background with a pale-green (`#c8e6c9`) monospace text, `max-height: 300px`, `overflow: auto`, `white-space: pre-wrap`. This is where every artifact (`fullRobotsTxt`, `aiTxt`, `metaTags`, `legalNotice`) is displayed.

### Copy button — `.copy-btn`
A small bordered button that turns orange-on-white on hover. Reused on every artifact module.

### Verify panel — `.verify-card` / `.draft-*`
The verify-your-fix module has an inverted header (black `--ink` background, panel-colored text, orange `.num`). `.draft-label` blocks hold the textareas (warm-grey, 1px border, orange focus outline). The `.verify-btn` is green (`--green`) — the "go" key. The `.after-row` shows the before score → arrow → after score with the breakdown.

### Skeleton loader — `.skeleton-*`
A `@keyframes blink` (0.25 → 1 opacity, 1.2 s) animation drives a `.skeleton-line` and a grid of `.skeleton-chip` placeholders, simulating blinking standby LEDs while a scan is in flight.

### Trust layer
- `.evidence-link` — a small bordered "view live ↗" button (orange on hover).
- `.method-note` — a muted, dashed-top-bordered note under each module.
- `.trust-card` — the honesty module; `.trust-body` is a two-column flex (`✓ Can` / `✗ Cannot`); `.trust-footnote` has an orange left border and a warm-grey background.

## Next.js App Router conventions

- `src/app/layout.tsx` is the required root layout; it wraps every route.
- `src/app/page.tsx` is the route segment for `/` — the only page.
- `src/app/api/protect/route.ts` and `src/app/api/verify/route.ts` are route handlers exposed at `/api/protect` and `/api/verify`.
- The `@/*` path alias (from `tsconfig.json` → `./src/*`) is used by the API routes; the page and layout use relative imports.
- `next.config.mjs` sets `reactStrictMode: true`, so React double-invokes effects in development.

## Upstream and downstream

- **Upstream** — `layout.tsx` is the App Router root; `globals.css` is imported only here.
- **Downstream** — the design system styles the [scan UI page](../ui/page.md) and is referenced by every module class the page uses.

## Scope boundary

This is the presentation layer. It holds no product logic; the scan, generate, score, and verify behaviors live in [the lib modules](../architecture/overview.md#module-boundaries) and [API routes](../api/protect-route.md). To change the visual language, edit the tokens in `:root` and the component classes; the page's class names are stable so restyling does not require touching `page.tsx`.
