# Care PR 2 UI evidence

These screenshots exercise the focused Care eligibility, waitlist, and consent
Pending surfaces. They use the existing Xenios `PageShell`, global header and
footer, Inter Tight/JetBrains Mono typography, white/graphite palette,
restrained purple accent, thin borders, current buttons, and current input
styling.

The screenshots contain development-only state fixtures. No patient, identity,
location, clinician, consent, intake, or production record was read or created.
The fixture hook and temporary App/Navbar wiring were removed before the branch
was validated; those shared files are absent from the PR diff.

## Desktop states

The browser was overridden to a 1440 × 900 CSS viewport. The in-app screenshot
backend encodes a downsampled 824 × 891 visible-page artifact, while the page
measurement reported `clientWidth: 1425`, `scrollWidth: 1425` after the
scrollbar—no horizontal overflow.

- [Loading](./care-pr2-desktop-loading.png)
- [Authoritative disabled/Pending](./care-pr2-desktop-disabled.png)
- [Retryable error](./care-pr2-desktop-error.png)
- [Location required](./care-pr2-desktop-location-required.png)
- [Consent content disabled](./care-pr2-desktop-consent-disabled.png)

## Mobile states

At the requested 375px viewport, the page reported equal 375px client and
scroll widths before the visible scrollbar was encoded. The artifacts show the
single-column waitlist state, one primary action, truthful no-promise language,
and the successful interest state.

- [375px waitlist](./care-pr2-mobile-375-waitlist.png)
- [375px interest recorded](./care-pr2-mobile-375-waitlist-success.png)

At the requested 320px viewport, the browser reported equal 305px client and
scroll widths after the scrollbar. The retry button measured 52px high and the
page had no horizontal overflow.

- [320px retryable error](./care-pr2-mobile-320-error.png)

## Zoom/reflow

The 640px CSS viewport is the standards-equivalent reflow width for a 1280px
viewport at 200% zoom. It reported equal 625px client and scroll widths after
the scrollbar.

- [200% reflow equivalent](./care-pr2-zoom-200-reflow-equivalent.png)

The available in-app browser does not expose persistent native page zoom.
Website 6 must still repeat native 200% browser zoom on the integrated
candidate; this evidence does not overclaim that release gate.

## Browser observations

- Loading, disabled, error, location-required, waitlist, success, and
  consent-unavailable states were visible.
- The error state exposed exactly one labeled `Try again` action.
- The waitlist state exposed exactly one labeled `Record my interest` action.
- The success state announced `INTEREST RECORDED · NO AVAILABILITY PROMISE`.
- The 320px retry target measured 52px high.
- Desktop body background computed to white.
- The page heading computed to the existing Inter Tight font stack.
- Browser console warnings/errors: zero.
- No provider, supported-state, clinician, pharmacy, prescription, product,
  price, treatment, or launch claim was shown.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
