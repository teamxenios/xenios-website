# Care PR 1 UI evidence

Captured on 2026-07-25 from the focused PR 1 shell using the current Xenios
global UI, the exact documented client route wiring, and the documented
narrow-mobile Navbar correction. The status responses were fixed test states;
no clinical data, provider, state, pharmacy, product, price, or availability
record was created.

| Artifact | Viewport | State | Verification |
|---|---:|---|---|
| `care-pr1-desktop-loading.jpg` | 1440 × 900 | Loading | `aria-busy=true`; Care remains unavailable while status is confirmed. |
| `care-pr1-desktop-disabled.jpg` | 1440 × 900 | Authoritative disabled | Displays `Care is being prepared.` and no clinical action. |
| `care-pr1-desktop-error.jpg` | 1440 × 900 | Dependency/error | Displays safe unavailable copy and one labeled `Try again` action. |
| `care-pr1-mobile-375-error.jpg` | 375 × 812 | Error/retry | One-column layout, no horizontal overflow, labeled retry action. |
| `care-pr1-mobile-320-error.jpg` | 320 × 640 | Error/retry | One-column layout, no horizontal overflow, labeled retry action. |
| `care-pr1-zoom-200-reflow-equivalent.jpg` | 640 × 800 CSS viewport | 200% reflow equivalent | Exercises the effective CSS width produced by a 1280px viewport at 200% zoom; no horizontal overflow and retry remains operable. |

Measured assertions:

- 320px, 375px, and 430px: document width did not exceed viewport width after
  the shared Navbar correction documented in
  `docs/coordination/WEBSITE_5_HANDOFF.md`.
- The browser surface does not expose a persistent page-zoom control. The
  committed 640px artifact is the standards-equivalent reflow width for a
  1280px viewport at 200%; Website 6 must still repeat native 200% browser zoom
  on the integrated candidate.
- Card sequence numbers are `aria-hidden`.
- The retained `--pulse` purple is 5.70:1 against the white card background.
- The shell reuses Xenios `PageShell`, typography, cards, buttons, spacing,
  borders, and status treatment.
- No Care-only stylesheet, second header, gradient, Georgia type, green palette,
  or rounded-shadow component system is present.

These images are pre-integration evidence. Website 2 and Website 6 must repeat
the viewport, zoom, accessibility, authorization, and production smoke checks
against the deployed SHA before the release can be marked live.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

PRODUCTION STATUS: NOT YET MERGED
