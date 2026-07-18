# Main Xenios Site UI Audit

**Status:** complete for Stage 1 baseline
**Owner:** CODEX_UI
**Started:** 2026-07-18
**Completed:** 2026-07-18
**Source commit:** `f9c44807fa3aa70021f27654a31c8dd8aa32a725`
**Source routes:** `/`, `/product`, `/how-it-works`, `/for-coaches`, `/about`, `/careers`
**Captured viewports:** 390 x 844, 768 x 1024, 1440 x 900

## Executive result

The main Xenios site contains a coherent intended design system in `client/src/index.css`: lowercase wordmark, Inter Tight display type, JetBrains Mono labels, black and white surfaces, restrained purple and teal accents, 4 px geometry, oversized headlines, generous vertical rhythm, thin rules, and shared `PageShell` navigation and footer.

The rendered baseline is not a safe implementation reference yet. Responsive Tailwind utilities are not taking effect in the browser, and some custom classes used by public pages do not exist. At 1440 px the primary navigation remains hidden, multi-column content remains stacked, hero buttons stretch to the full container width, `.rule-all` has no border, and `.btn-ghost-on-dark` renders as an unstyled blue link. At 320 px the header and waitlist ribbon cause horizontal overflow.

Research should reuse the intended tokens and shared component concepts, but it should not copy the current broken rendered behavior. No Research redesign started under this audit. Shared responsive-CSS ownership and the public Research copy boundary must be decided first.

## Sources inspected

- Global fonts, metadata, social cards, and structured data: `client/index.html`
- Tokens and primitives: `client/src/index.css`
- Shared shell: `client/src/components/PageShell.tsx`
- Header and full-site menu: `client/src/components/Navbar.tsx`
- Ribbon: `client/src/components/TopRibbon.tsx`
- Footer: `client/src/components/Footer.tsx`
- Wordmark: `client/src/components/Wordmark.tsx`
- Scroll reveal: `client/src/components/Reveal.tsx`
- Navigation data: `client/src/lib/nav.ts`
- Main route content: `client/src/pages/Home.tsx`, `Product.tsx`, `HowItWorks.tsx`, `ForCoaches.tsx`, `About.tsx`, and `Careers.tsx`
- Research shell and primitives: `client/src/research/layout.tsx` and `client/src/research/components.tsx`

## Typography and fonts

`client/index.html` loads Inter Tight at weights 500 through 900 and JetBrains Mono at weights 500 and 600 from Google Fonts.

- Body: Inter Tight, weight 500.
- `.display-xl`: weight 800, `clamp(40px, 6.6vw + 0.5rem, 132px)`, line-height 0.98, tracking -0.025em.
- `.display-l`: weight 800, 32 to 96 px, line-height 1, tracking -0.022em.
- `.display-m`: weight 800, 28 to 64 px, line-height 1.06, tracking -0.02em.
- `.display-s`: weight 700, 24 to 48 px, line-height 1.1.
- `.h3`: weight 700, 20 to 32 px, line-height 1.2.
- `.body-l`: 17 to 20 px, line-height 1.55.
- `.body-m`: 15 to 17 px, line-height 1.6.
- `.body-s`: 14 px, line-height 1.55.
- `.mono-cap` and `.eyebrow`: JetBrains Mono, weight 600, 12 to 14 px, 0.06em tracking, uppercase.

Rendered H1 measurements were consistent on all six routes: 40 px at 390, 58.688 px at 768, and 103.04 px at 1440. This scale is a strong brand pattern to reuse, subject to line-length and content-density checks.

## Containers, gutters, and spacing

`.container-x` is the shared centered container. It applies the configured maximum width plus left and right gutter padding.

| Minimum width | Container maximum | Gutter |
|---:|---:|---:|
| default | 100% | 16 px |
| 375 | 100% | 20 px |
| 390 | 100% | 24 px |
| 768 | 720 px | 28 px |
| 820 | 760 px | 32 px |
| 1024 | 960 px | 40 px |
| 1280 | 1200 px | 48 px |
| 1440 | 1320 px | 56 px |
| 1920 | 1440 px | 64 px |
| 2560 | 1600 px | 80 px |

Vertical rhythm tokens:

| Minimum width | Section | Block | Card | Hero top | Hero bottom |
|---:|---:|---:|---:|---:|---:|
| default | 52 px | 40 px | 24 px | 96 px | 80 px |
| 768 | 72 px | 56 px | 32 px | 120 px | 112 px |
| 1024 | 96 px | 72 px | 40 px | 152 px | 144 px |
| 1280 | 116 px | 88 px | 40 px | 200 px | 176 px |

The token scale is reusable. The current rendered desktop pages are much taller than intended because responsive grid and flex utilities fail, leaving content in single-column flow.

## Buttons and form controls

The main site uses custom CSS classes rather than the shadcn primitive in `client/src/components/ui/button.tsx`.

- `.btn`: inline flex, 4 px radius, 15 px weight-700 label, 52 px high with 20 px horizontal padding.
- At 390: 56 px high and 24 px padding.
- At 768: 60 px high, 28 px padding, 16 px label.
- At 1024: 64 px high and 32 px padding.
- Primary: black fill, white text.
- Secondary: white fill, black text and border.
- Ghost: transparent, underline-style bottom border, square corners.
- Active feedback: `scale(0.97)`.
- Inputs: 4 px radius, 52 to 60 px high, 17 px text, black border, purple focus border.

Two defects affect reuse:

1. `.btn` is declared after Tailwind utilities and sets `display: inline-flex`, so `hidden sm:inline-flex` on the header CTA is rendered as flex even below `sm`.
2. `.btn-ghost-on-dark` is used by pages but is not defined. It renders as the browser-default blue link on black surfaces. The defined selector is `.btn-on-dark.btn-ghost`.

`client/src/components/ui/button.tsx` and `card.tsx` use a separate rounded shadcn vocabulary. Research should not mix those rounded primitives with the main site's 4 px system without an explicit consolidation decision.

## Cards, borders, colors, and surfaces

- `.card`: white surface, 1 px `--rule` border, 4 px radius, token-based padding.
- `.tile`: flex column, 4 px radius, 1 px rule, 28 to 36 px padding, fixed minimum height from 220 to 260 px.
- Rules: `rule-top`, `rule-bottom`, and `rule-y` use a 1 px `rgba(14,14,14,.10)` border.
- `.rule-all` is used widely but is not defined, so its computed border is `0px none`.
- Primary surfaces: `--paper #FFFFFF`, `--paper-2 #F4F4F5`, `--ink #0E0E0E`, `--ink-2 #2A2A2A`, `--ink-mute #6B6B6B`.
- Accents: `--pulse #7C3AED`, `--teal #14B8C7`, `--lilac #B89AFA`, `--error #B83A1F`.
- Gradients are reserved for accent pills and selected deep panels; the primary site language remains flat black and white.

Reuse the 4 px card geometry, thin rules, flat surfaces, and restrained accent palette. Avoid the tile minimum-height rule for variable editorial content unless equal-height cards are intentionally required.

## Image treatment

The audited main routes use almost no editorial photography or illustration. The visual system is typography, rules, counters, flat fields, gradients, and whitespace. `Wordmark.tsx` uses `/brand/xenios-mark-transparent.png` as a CSS mask so the mark inherits the current color.

Research assets should therefore be introduced deliberately, with provenance and alt text in `docs/research-input/ASSET_MANIFEST.md`. They should not create a second visual language or replace hierarchy that the main site expresses typographically.

## Navigation behavior

`PageShell.tsx` composes `TopRibbon`, sticky `Navbar`, main content, and `Footer` for public main-site pages.

The intended header behavior in `Navbar.tsx` is:

- Sticky 64 px navigation over a 40 px black waitlist ribbon.
- Primary links appear at `lg`.
- Menu button opens an `aria-modal` dialog.
- Dialog moves focus to Close, handles Escape, traps Tab at the first and last focusable elements, prevents body scroll, and returns focus to the trigger.
- Full menu uses the same grouped navigation data as the footer.

Browser checks confirmed the menu opens as a dialog, initially focuses Close, closes with Escape or the Close control, and restores the trigger in source logic. The browser-default focused outline is visible. The rendered responsive state is wrong: primary navigation computed `display: none` at 390, 768, and 1440, while the early-access CTA computed `display: flex` at every width.

At 320 px, the menu action row reaches 356 px in a 305 px client area, producing horizontal overflow. The waitlist text reaches 387 px. At 390 px the ribbon text alone reaches 395 px, although document-level clipping prevents a scrollable overflow in the exact Chrome capture.

## Footer behavior

`Footer.tsx` is intended to move from one column to two columns at `md`, then to a five-column layout at `lg`. It reuses `menuGroups`, the wordmark, contact information, social links, and the live waitlist counter. Because responsive Tailwind variants fail, the desktop footer remains substantially stacked and contributes to excessive page height.

The footer's exact descriptor, “An AI workspace for health and performance professionals.”, matches repository brand guidance. The copyright line uses the uppercase legal entity name appropriately; visible brand references elsewhere should remain lowercase.

## Motion and focus

`Reveal.tsx` applies a one-time opacity and 14 px vertical reveal over 0.56 seconds, driven by `IntersectionObserver`, with an immediate in-view path and a 1.5 second safety fallback. Buttons use short color and scale transitions. Counter, gradient-pill, marquee, and agent-line animations each include `prefers-reduced-motion` rules, and the global reduced-motion block disables animated scroll and transitions.

The main navigation relies on the browser focus outline for button focus. Inputs use only a purple border change. Preserve the reduced-motion behavior, but add explicit, consistent `:focus-visible` styling before treating the system as production-ready.

## Responsive breakpoints

The CSS token breakpoints are 375, 390, 768, 820, 1024, 1280, 1440, 1920, and 2560 px. Component markup also uses Tailwind `sm`, `md`, `lg`, and `xl` variants.

The rendered result demonstrates that the token media queries work, while responsive Tailwind variant utilities do not. Evidence:

- H1 and container measurements change at the custom media queries.
- `hidden lg:flex` remains `display: none` at 1440.
- `hidden sm:inline-flex` becomes flex at 320 because the later `.btn` rule wins.
- `sm:flex-row`, responsive grids, and footer columns remain in their base state.
- The stylesheet starts with the Tailwind v3 directives while the repository uses Tailwind v4 tooling. This is the leading configuration hypothesis, not yet an implemented fix.

## Route observations

| Route | 390 px height | 768 px height | 1440 px height | Observation |
|---|---:|---:|---:|---|
| `/` | 5569 | 5497 | 6762 | Strong hero and manifesto rhythm; desktop remains stacked; ghost-on-dark CTA is unstyled. |
| `/product` | 5082 | 4584 | 5306 | Clear day-in-the-life narrative; hero CTA expands full width; desktop steps do not form intended layouts. |
| `/how-it-works` | 3839 | 3541 | 4194 | Strong numbered sequence; oversized H1 is effective; desktop still uses narrow stacked content. |
| `/for-coaches` | 4551 | 4230 | 4982 | Clear audience story; full-width CTA and missing ghost style weaken the hero. |
| `/about` | 3580 | 3304 | 3741 | Strong brand thesis; no primary navigation at desktop. |
| `/careers` | 4214 | 3865 | 4393 | Consistent editorial hierarchy; desktop content remains stacked. |

All heights are exact document `scrollHeight` values from the captured viewport. All six routes rendered without application console errors.

## Research comparison

The current Research route family uses its own header and footer in `client/src/research/layout.tsx`, not the main `PageShell`. It has local reusable primitives in `client/src/research/components.tsx`, but it duplicates rather than extends the main shell.

At 390 px, `/research`, `/research/membership`, `/research/framework`, `/research/faq`, and `/research/apply` all measured approximately 17 px of page-level horizontal overflow. The header action row and cart link reach 392 px in a 375 px client width. The same hidden-CTA cascade defect exposes “Apply for Membership” on mobile. `/research` is 9066 px tall and presents a large password-gated product and membership surface without imagery.

## Screenshot baseline

Exact full-page PNGs and computed metrics are versioned in `docs/research-design/baseline/main-site/`:

- `home--390x844.png`, `home--768x1024.png`, `home--1440x900.png`
- `product--390x844.png`, `product--768x1024.png`, `product--1440x900.png`
- `how-it-works--390x844.png`, `how-it-works--768x1024.png`, `how-it-works--1440x900.png`
- `for-coaches--390x844.png`, `for-coaches--768x1024.png`, `for-coaches--1440x900.png`
- `about--390x844.png`, `about--768x1024.png`, `about--1440x900.png`
- `careers--390x844.png`, `careers--768x1024.png`, `careers--1440x900.png`
- `metrics.json`

## Console, network, overflow, and accessibility observations

- Local URL: `http://127.0.0.1:5000` using the pinned Node 20.19.0 and npm 10.8.2 toolchain.
- Console: no page console errors or warnings during the audited routes and menu interaction.
- Network: `/api/waitlist/count` returned 500 because local Supabase configuration was intentionally absent; the UI showed its fallback count of 556.
- Overflow: waitlist ribbon at 390; header CTA plus ribbon at 320; current Research shell at 390.
- 200 percent zoom approximation: at a 640 CSS-pixel viewport, document width remained contained, but the primary navigation was still absent.
- Keyboard: menu dialog, close control, Escape behavior, body scroll lock, and focus-return logic are present; explicit focus styling is weak.
- Reduced motion: relevant animations and reveal transitions have CSS fallbacks.
- Metadata: `client/index.html` still contains “operating system”, “AI-adjunct”, and “pocket coach” language that conflicts with current repository brand-copy guidance and needs content-owner review.

## Patterns to reuse

- Lowercase wordmark and masked brand mark.
- Inter Tight plus JetBrains Mono pairing.
- Large, tight display type with short line lengths.
- Shared container and vertical-rhythm tokens.
- Black and white surfaces, thin rules, and 4 px geometry.
- Purple and teal as restrained accents, not dominant page chrome.
- Shared navigation data and accessible modal-menu structure.
- Reduced-motion support and reveal safety fallback.

## Patterns not to use until repaired or decided

- Current responsive Tailwind behavior.
- Undefined `.rule-all` and `.btn-ghost-on-dark` classes.
- Duplicate main-site and Research shells.
- Duplicate custom and shadcn button/card systems.
- Fixed card minimum heights for long editorial content.
- Public peptide or GLP-1 language before the stealth-copy decision is approved.
- Unlicensed or unattributed imagery.

## Gate to the next cycle

Before substantive Research redesign, the team should:

1. Assign and repair the shared responsive-CSS foundation, or explicitly isolate a compatible Research implementation.
2. Decide whether public Research peptide and product routes override the current public stealth-copy rule.
3. Move the canonical V2 specification into a versioned source-of-truth location or approve a maintained summary.
4. Confirm the shared shell extension strategy and prevent parallel edits to `index.css`, `Navbar.tsx`, `Footer.tsx`, and routing without claims.
