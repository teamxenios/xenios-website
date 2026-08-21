# Xenios Live UX Hotfix RC — 2026-08-21

## Freeze basis

- Current production SHA: `5c23225fd3223c64ab2851fa31bf44969e7b702c`
- Hotfix branch: `codex/live-ux-performance-hotfix-20260821`
- Tested code SHA: `1971c365308558036491db0c3755cca4f09b4890`
- Deployment performed in this lane: **No**
- Production order/email flow replayed: **No** — founder evidence is authoritative and no duplicate order was created.

## Implemented scope

- The Family filter validates and forwards closed canonical Master Offering family values. Invalid display/free-text values fail closed instead of widening the query.
- The Action filter applies the canonical assisted-order workflow mode after the authoritative pathway, binding, and price projection. Search, Family, and Action compose across all bounded source pages before result paging.
- Classification-pending products remain non-direct and now say **Request Order**.
- provider-only products remain non-selectable in Research and now offer **Continue through Care** to the existing `/care` route.
- Early Access sign-out synchronously clears the complete `xenios.assisted-order.*` storage family, including bearer status tokens, receipt/reference state, drafts, and future prefixed artifacts, before waiting for the logout request. Existing cart and recovery cleanup remains intact.
- Featured copy now truthfully distinguishes the current 50-unit checkout ceiling from the already-supported assisted-order request band of 1–100 per exact variant. No quantity validator or migration was widened.

## Performance decision

The founder-observed production baseline remains approximately 10 seconds to first useful catalog/product. This RC does not claim an after-deploy timing improvement because it was not deployed or measured against production.

The remaining latency is not safely removable as a small code-only change:

- catalog projection must keep hold, supplier, price, and pathway authority fresh;
- Action is a downstream variant fact, so an Action-filtered request must scan the bounded canonical pages before paging the derived matches;
- the existing pending bulk-unit-facts migration can remove per-unit fallback reads, but applying a migration was expressly outside this hotfix;
- caching or bypassing the remaining supplier reads could expose withdrawn inventory or break shelf/submit parity.

Result: catalog performance is recorded as **unchanged / unmeasured after deploy**. No unsafe cache or authority shortcut was introduced.

## Verification on tested code SHA

- Focused hotfix regression set: **9 files, 120 tests passed**
- Assisted-order lane: **14 files, 224 tests passed**
- Composed E2E gate: **4 files, 53 tests passed**
- Full repository suite: **710 files passed, 4 skipped; 10,392 tests passed, 43 skipped; 0 failed**
- Typecheck (`npm run check`): **PASS**
- Production build (`npm run build`): **PASS**
- `git diff --check`: **PASS**
- Independent read-only review: **no security blocker**

## Explicit exclusions

No catalog-data release, pricing change, payment or fulfillment automation, environment change, database migration, production order, production deployment, or rollback is part of this RC.

The branch may be deployed only after the founder approves the exact origin-verified freeze SHA.
