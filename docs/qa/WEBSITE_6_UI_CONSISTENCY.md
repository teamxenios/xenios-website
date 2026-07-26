# Website 6 Xenios UI consistency review

## Shared QA branch

The Website 6 change does not add a visual system. It extends the existing
global button treatment with an explicit accessible dark-surface ghost style
and corrects the existing header/ribbon behavior at 320px. Typography, palette,
spacing, borders, shadows, navigation, and component ownership remain unchanged.

Automated enforcement:

- `npm run qa:ui` freezes the current production palette/font/gradient/shadow/
  radius/button-selector footprint and rejects growth without Website 2 review.
- It rejects duplicate third-party UI frameworks and unauthorized external font
  imports.
- Playwright covers 320, 375, 430, tablet, desktop, keyboard, form labeling,
  horizontal overflow, and serious/critical WCAG findings.
- `npm run qa:evidence` captures desktop, 375px, populated, empty, form, and
  unavailable/auth-recovery reference states.

## Cross-PR review state

- Website 3 / PR #47: domain checks pass; Website 2 returned the client UI for
  Xenios visual-system revision. Awaiting a new frozen head before Website 6
  visual verification.
- Website 4 / PR #48: domain integration remains draft and requires shared route,
  provider, persistence, and visual verification after Website 2 integration.
- Website 5 / PR #46: domain isolation checks pass; Website 2 returned the
  independent Care visual identity for revision. Awaiting a new frozen head.
- Website 1: no open PR was available at final recheck.

## Checklist

1. Existing kit/font/palette preserved: Yes for Website 6.
2. Duplicate visual systems avoided: Yes for Website 6; automated budget added.
3. Purple/cards/spacing/buttons remain restrained and consistent: Yes.
4. Loading/empty/error/success/disabled/Pending evidence: automated state
   coverage exists; cross-domain live verification remains release-owned.
5. Mobile, keyboard, focus, labels, contrast, reduced motion: passed on the
   Website 6 integrated base after the shared fixes.
6. Navigation and unfinished feature placement: route/sitemap gate active.
7. Truthful data and developer-copy checks: fixture-only tests are explicitly
   excluded from production completion.
8. Production confirmation: pending Website 2 merge and Render deployment.

UI CONSISTENCY STATUS:

NEEDS REVISION

The Website 6 shared fixes match existing Xenios. The integrated release cannot
be marked as matching until PRs #46 and #47 return with approved visual revisions
and Website 6 verifies the deployed live surfaces.
