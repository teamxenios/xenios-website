# Shared Components

**Status:** Stage 1 inventory complete

The main-site audit will record the actual component, file path, consumers, extension strategy, and risk for each shared component.

| Component or file | Current consumers | Reuse strategy | Risk |
|---|---|---|---|
| `client/src/components/PageShell.tsx` | Main public pages | Extend or parameterize for Research | Research currently has a duplicate shell |
| `client/src/components/Navbar.tsx` | Main `PageShell` | Preserve accessible modal behavior and shared nav data | Responsive utilities fail; header overflows at 320 |
| `client/src/components/Footer.tsx` | Main `PageShell` | Reuse navigation groups and descriptor | Responsive columns fail |
| `client/src/components/TopRibbon.tsx` | Main `PageShell` | Decide whether Research inherits it | Ribbon text overflows narrow widths |
| `client/src/components/Reveal.tsx` | Main public pages | Reuse with reduced-motion fallback | Needs consistent focus and motion QA around revealed controls |
| `client/src/components/Wordmark.tsx` | Main nav/footer, Research can adopt | Reuse directly | None found in Stage 1 |
| `client/src/index.css` | Entire client | Treat tokens as source of truth after responsive repair | Highest merge-conflict and regression risk |
| `client/src/research/layout.tsx` | Research route family | Consolidate with or extend `PageShell` | Duplicates nav/footer and overflows at 390 |
| `client/src/research/components.tsx` | Research pages | Retain content primitives while adopting main tokens | Must avoid a separate visual system |
| `client/src/components/ui/button.tsx` and `card.tsx` | shadcn-style consumers | Do not mix implicitly with main custom primitives | Rounded geometry conflicts with 4 px main system |

No shared component is claimed for modification under `UI-001`; inspection is read-only.
