# Website 3 member UI evidence

Captured from the corrected PR #47 component head through an isolated local
Vite render. The preview used the real `ProductCatalogExperience` component and
the repository design system. It did not use or claim production data.

## Desktop

- Browser viewport request: 1440 x 1000.
- Browser content viewport: 1265 px after in-app browser chrome.
- Document client width and scroll width: 1265 px / 1265 px.
- Result: no page-level horizontal overflow.
- Evidence: `website3-catalog-desktop-1440.png`.

## Mobile

- Browser viewport request: 320 x 900.
- Browser content viewport: 305 px after in-app browser chrome.
- Document client width and scroll width: 305 px / 305 px.
- Result: no page-level horizontal overflow. The family-filter row retains its
  intentional, keyboard-reachable horizontal scroller.
- Evidence: `website3-catalog-mobile-320.png`.

## Keyboard and accessibility

- The rendered accessibility tree exposes one level-one catalog heading, four
  level-two product headings, a named `Search products` searchbox, ten product
  family buttons with `aria-pressed`, and descriptive product links.
- The search control displays a visible violet focus border.
- Evidence: `website3-catalog-keyboard-focus-320.png`.

## Truthfulness review

- No fake price, inventory, partner activation, affiliate URL, provider result,
  purchase button, or clinical promise is shown.
- Pending and Coming Soon states remain explicit.
- The request action uses the shared, server-accepted `products` attribution
  source.
