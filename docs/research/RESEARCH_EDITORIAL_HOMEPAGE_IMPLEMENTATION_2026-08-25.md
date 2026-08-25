# Xenios Research editorial homepage implementation

Date: 2026-08-25

Branch: `codex/research-editorial-homepage-20260825`

Base: `6077a6bbb276acf9669c1419c735a9327f8740b1`

## Outcome

The public Research gateway now uses an original warm-silver editorial direction inspired by the supplied mood reference without copying its text, composition, logo treatment, or imagery. The page pairs a photographic glass-and-liquid hero with restrained typography, warm neutral surfaces, generous spacing, and a clear access hierarchy.

The page contains, in order:

1. Hero and primary access actions
2. Research offering overview
3. Research-area taxonomy
4. Standards and differentiation
5. Current-offerings explanation
6. Quality and documentation presentation
7. Access pathway
8. Organization and B2B pathway
9. Research-versus-provider boundary
10. Final membership call to action
11. Research footer

## Access and catalog boundaries

- Every master-catalog link resolves to `/research/member/products`.
- The gateway does not fetch, render, cache, or infer catalog records, prices, inventory, member data, or billing state.
- The existing member route and server authorization remain the source of truth.
- No server authorization, account, billing, referral, Supabase, or email files were changed.
- The page states: `For research use only. Not for human or veterinary use.`
- Research tracking and indexing behavior were not loosened.

The direct catalog destination is deliberately canonical. A signed-out visitor is still stopped by the existing shared Research gate before reaching normal member authentication; this is an existing access-flow behavior, not a homepage bypass.

## Original asset

`client/public/research/editorial-hero-warm-silver.jpg`

- Original, generated warm graphite/taupe glass-and-liquid abstraction
- 1586 × 992 pixels
- 133,404 bytes
- No supplier product, third-party logo, copied composition, vial, label, or embedded text
- Decorative empty alt text; the semantic content is carried by the adjacent heading and copy

## Responsive and accessibility implementation

- Route-scoped CSS with no `100vw` dependency
- Horizontal overflow clipped at the page shell
- Mobile treatments at 900, 620, and 360 CSS pixels
- Header access actions remain visible on narrow screens
- Fixed mobile catalog action reserves document space and respects safe-area insets
- One `h1`; labelled landmark sections; skip link; descriptive link labels
- Visible `:focus-visible` treatment
- Minimum 44-pixel interactive targets
- Reduced-motion and forced-colors handling
- Updated text colors meet WCAG AA contrast in the reviewed light and dark surfaces

## Verification

- Focused gateway/access suite: 37/37 tests passed
- TypeScript: passed (`tsc --noEmit`)
- Production client/server build: passed
- Diff hygiene: passed (`git diff --check`)
- Independent source-level UI/accessibility review: no remaining P0 or P1 findings

The guard tests assert semantic structure, protected catalog destinations, public-copy constraints, no client data fetching, no external URLs, no public prices or commerce controls, responsive CSS safeguards, focus treatment, reduced-motion handling, forced-colors handling, and the same protected destination across the required test widths.

## Evidence still required before release approval

Real rendered screenshots remain required at 320, 375, 390, 430, 768, and 1440 CSS pixels plus 200 percent browser zoom. The in-app browser refused the local preview URL under its URL-safety policy, so this implementation does not claim that visual-evidence gate as passed. No alternate browser mechanism or policy workaround was used.

The repository's global `index.html` also requests Google Fonts before route code runs. The gateway itself uses system-font declarations and adds no analytics or third-party requests, but the global font request should be resolved separately if the Research privacy rule is intended to prohibit every third-party network request rather than tracking alone.

## Files in this workstream

- `client/src/research/pages/Gateway.tsx`
- `client/src/research/pages/gateway-editorial.css`
- `client/public/research/editorial-hero-warm-silver.jpg`
- `client/src/research/pages/Gateway.catalog-guard.test.tsx`
- `client/src/research/pages/public-access-flow.test.tsx`
- `docs/research/RESEARCH_HOME_CATALOG_POLICY.md`
- `docs/research/RESEARCH_EDITORIAL_HOMEPAGE_IMPLEMENTATION_2026-08-25.md`
- `vitest.config.ts` (test-only Tailwind/PostCSS alignment)

## Not included

No production deployment, product publication, pricing, checkout, billing enablement, referral enablement, database migration, member-dashboard expansion, or backend-contract change is part of this branch.
