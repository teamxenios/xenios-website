# Health launch successor: public catalog entry slice

Date: 2026-09-30. Branch: `codex/xenios-health-launch-implementation-20260930`.
Base: `8e0271e9c03d7724df9437e8723aac2edc9afcb7`. Historical qualified UX runtime `c213707a9d80ecc9f772b5790acb52f1fa503da7` remains untouched.

## Scope and result

This bounded first slice addresses the navigational part of Claude finding HL-01. The `/products` hero and Research pathway tile now lead to the existing `/research/early-access` server-projected catalog rather than looping back to `/products` or presenting status as the primary action. The page explains that an eligible request is not a paid order, and keeps Care and practice pathways separate. The public page no longer says that signing in is required to view the catalog.

This does **not** claim that every intended catalog row is served, that the ordering bridge/open-access flags are currently enabled in production, or that a legitimate paid order is complete. Product detail `/products/:slug` still uses the pre-existing unavailable page. HL-11 catalog reconciliation and HL-12 quote/payment amount binding remain open release blockers. No product, price, availability, clinical or payment authority changed in this slice.

## Sources and limits

- Repository continuity and the 2026-09-29 exact-SHA P-17 handoff were read first.
- The original 18-section [Full Website UX Source of Truth](https://docs.google.com/document/d/1qogOnIU9P40rV0iVeTAPO6Yai5R8kgQohFdmuFe8s2I/edit) and seven-section [Master Vision](https://docs.google.com/document/d/1lwzdlJsjSd473LEE464xCZxwUFQLOo5aJz9eaY60UI8/edit) were accessible through the connected Drive source. The UX map calls for a clear visitor path from `/health` to Research catalog, assisted request, durable reference and truthful payment status; future vision is explicitly proposed, not current service authority.
- Claude's existing review branch `claude/xenios-health-launch-review-20260930` was read at `1a4e863a337fa304cbc0e4743d798d13effcfb34`. Its HL-01, HL-11, HL-12 and pricing acceptance are independent findings on the frozen candidate, not a review of this successor.
- `02_WEBSITE_COPY_DESIGN_AND_UX.md`, `03_OPERATING_SYSTEM_SPEC.md`, `17_PACKAGES_SUPERPOWER_AND_CULTURE_EVENTS.md`, `18_CONTINUOUS_OPERATIONS_AND_AUTOMATION_CATALOG.md`, and `18_WEBSITE_PRICING_RECONCILIATION.md` were not present under their stated filenames in Downloads or the supplied attachment directory. Their contents were not invented. Repository price/UX records and the linked originals remain available for independent engineering work.

## Local validation

Private Node `v20.19.0`, npm `10.8.2`; dependencies installed in this worktree with `npm ci` under that runtime.

- `npm test -- client/src/App.routes.test.ts client/src/clarity/pages.test.tsx --reporter=dot`: 25 passed.
- `npm run check`: pass.
- `npm run verify:no-em-dash`: pass, 1,332 runtime source files scanned, zero forbidden forms.
- `npm run build`: pass, 224 production-build files scanned, zero forbidden forms. Existing Vite dynamic/static import warnings remain non-fatal.
- `npm run verify:route-uniqueness`: pass, 453 registrations across 444 call sites.
- `npm test -- server/core-site-protection.test.ts server/release-control-plane.test.ts --reporter=dot`: 88 passed, one intentional skip.

This is local source/build evidence. No browser journey or managed database test was run for this slice. Full suite was not rerun because this is a bounded public-navigation change with focused and release-control checks. Production and staging were not read anew or mutated. No deployment, migration, real email, charge or supplier action occurred.

## Next source work

1. Reconcile the exact 426 workbook rows to the founder's 2026-09-30 decisions recorded in the independent review: three specific variants remain excluded, GRP-0422 held, and confirmed Hexarelin/Oxytocin source cents are 6250/10750. Do not mutate Product Control or invent prices.
2. Resolve the exact-decimal price conversion/17-cent-difference ledger and server price authority, then test display-to-request-to-quote snapshots.
3. Close HL-12 on the mounted assisted-order service and effective SQL so `paid` requires an authorized amount/currency-bound verification, not arbitrary text. Keep M71/P-17 staging qualification separately authorized.
4. Ask the existing Claude reviewer to inspect the eventual exact successor SHA/tree through the established handoff; this source slice has no independent successor disposition yet.
