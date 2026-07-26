# Website 3 UI consistency evidence

Captured from PR #47 after rebasing onto current `main`. The isolated preview
rendered the real Website 3 React components with the repository's existing
`ResearchMemberShell`, UI kit, global CSS, and Research tokens. Fixture records
were used only for visual testing and are not production data.

## Existing Xenios comparison

The review compared the refactor with:

- the live Xenios public site and Research access page;
- the current `ResearchMemberShell` and `PageHeader`;
- the live-code `Products` and `ProductPage` member routes;
- the shared `ResearchRouteBoundary`, `ResearchEmptyState`,
  `ResearchPendingPanel`, `ResearchStatusBadge`, `ResearchSecureNotice`,
  `ResearchFilterBar`, `ResearchSearch`, and `ResearchTabs` primitives;
- the existing `--paper`, `--ink`, `--ink-mute`, `--rule`, and `--pulse`
  tokens plus the current `card`, `btn`, `input-field`, `mono-*`, and body
  typography classes.

The Website 3 client directory contains no gradients, oversized 2rem/2xl
rounding, feature shadows, or hard-coded slate/indigo/amber/emerald utility
palette. No new global token or CSS system was added.

## Populated catalog

- Desktop viewport request: 1440 x 1000.
- Browser content width / document scroll width: 1440 / 1425 px.
- Result: no page-level horizontal overflow.
- Evidence: `website3-catalog-desktop-1440.png`.
- The catalog uses the current shell, page header, search, tabs, one-column
  member cards, status badges, and button system.

## Mobile

- 375 px viewport evidence:
  `website3-catalog-mobile-375.png`.
- 320 px viewport evidence:
  `website3-catalog-mobile-320.png`.
- Browser content widths / document scroll widths:
  375 / 360 px and 320 / 305 px.
- Result: no page-level horizontal overflow at either required width.
- Primary and secondary actions measured 52 px high in the 375 px render.
- The existing member subnavigation remains the only controlled horizontal
  region on narrow screens.

## Empty, unavailable, and error states

- Empty catalog: `website3-catalog-empty-375.png`.
- Unavailable catalog: `website3-catalog-unavailable-375.png`.
- Actionable error with retry: `website3-catalog-error-375.png`.
- All three reuse the shared route/empty/error presentation. Input and account
  state are not represented as lost or changed.

## Diagnostics and form evidence

- Diagnostics pending partner surface:
  `website3-diagnostics-desktop-1440.png`.
- Biomarker progress and private upload form:
  `website3-diagnostics-biomarker-form-1440.png`.
- Metabolic pathway interest form:
  `website3-care-form-desktop-1440.png`.
- Both desktop pages measured 1425 px document width within a 1440 px viewport,
  with zero computed gradient backgrounds and no horizontal overflow.

## Keyboard and accessibility

- Visible keyboard focus at 320 px:
  `website3-catalog-keyboard-focus-320.png`.
- The accessibility tree exposes semantic page and section headings, a named
  searchbox, a labeled product-family tablist, descriptive product links,
  status text that does not rely on color, native form labels and controls,
  live success/error messages, and explicit pending/unavailable copy.
- Evidence was captured with the existing reduced-motion and focus-visible
  system intact.

## Truthfulness review

- No fake price, inventory, partner activation, affiliate URL, provider result,
  purchase button, clinical availability, or clinical promise is shown.
- Pending, Coming Soon, unavailable, and documentation-pending states remain
  explicit.
- Product-request actions use the browser-safe shared contract at
  `shared/research/product-request-sources.ts`.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
