# Xenios Live UX Hotfix RC — 2026-08-21

## Freeze basis

- Current production SHA: `5c23225fd3223c64ab2851fa31bf44969e7b702c`
- Hotfix branch: `codex/live-ux-performance-hotfix-20260821`
- Tested code SHA: `cfdd8a7a7c2854b6fb00670fc10349cfe264f583`
- Deployment performed in this lane: **No**
- Production order/email flow replayed: **No** — founder evidence is authoritative and no duplicate order was created.

## Implemented scope

- The Family filter validates and forwards closed canonical Master Offering family values. Invalid display/free-text values fail closed instead of widening the query.
- The Action filter exposes exactly four customer groups — **Direct Order**, **Request Order**, **Care**, and **Temporarily Unavailable / Held** — mapped from the closed canonical workflow vocabulary. It never reads CTA text. Search, Family, and Action compose across all bounded source pages before result paging; clearing Family restores the full applicable result set.
- Structured `temporarily_unavailable`, `available_this_week`, `coming_soon`, `planned`, and `unavailable` states remain non-direct. A held row stays held even when unpriced, and the client will not add a row the submit service refuses.
- Classification-pending products remain non-direct and now say **Request Order**.
- provider-only products remain non-selectable in Research and now offer **Continue through Care** to the existing `/care` route.
- Early Access sign-out synchronously clears the complete `xenios.assisted-order.*` storage family, including bearer status tokens, receipt/reference state, drafts, and future prefixed artifacts, before waiting for the logout request. Existing cart and recovery cleanup remains intact. The in-memory recovery order and price-change state are also reset, and the same mounted page is re-authenticated in regression proof to show the prior order cannot return.
- Featured copy now truthfully distinguishes the current 50-unit checkout ceiling from the already-supported assisted-order request band of 1–100 per exact variant. No quantity validator or migration was widened.

## Performance decision

The founder-observed production baseline remains approximately **9.59 seconds for the catalog API / 10.80 seconds to first product**. No representative local database mirrors the production round-trip profile, and production credentials were not used, so:

**POST-FIX REPRESENTATIVE TIMING: UNAVAILABLE**

A safe bounded change was made: after the fatal inventory read succeeds, the independent bulk hold and supplier-confirmation reads now start together. Their critical path changes from `Tinventory + Tholds + Tconfirmations` to `Tinventory + max(Tholds, Tconfirmations)`. Inventory failure short-circuit, hold/confirmation fallback behavior, deterministic degradation reporting, freshness, empty-read protection, and submit-time re-resolution are unchanged.

Query count is intentionally unchanged. At the current measured shape (`P=236` products, `U=424` variants, `C≈424` confirmation candidates, `L=0` real matching lots), the declared-facts window is:

- bulk RPCs available: `ceil(P/100) + L + 2 = 5` database calls;
- migration `20260821170000` absent: `ceil(P/100) + L + (1 + U) + (1 + C) = 853` calls.

The production ledger still records that bulk-facts migration as optional/pending, and applying it was outside this hotfix. With that fallback active, the broader catalog path is structurally about **877 calls** before session/identity work: 853 declared-facts calls, about 22 released-unit supplier lookups, and 2 release-ledger reads. Cold catalog content also performs two sequential stable `listDetails()` snapshots (32 chunked queries at `P=236`); warm content uses the existing 60-second guarded cache. The client also waits for the cart-capability response before beginning the Featured catalog request. Those are the exact remaining bottlenecks; no unsafe cache lifetime or authority shortcut was introduced.

## Verification on tested code SHA

- Focused hotfix and affected-lane regression set: **13 files, 166 tests passed**
- Composed E2E gate: **4 files, 53 tests passed**
- Full repository suite on `cfdd8a7a7c2854b6fb00670fc10349cfe264f583`: **710 files passed, 4 skipped; 10,402 tests passed, 43 skipped; 0 failed**
- Typecheck (`npm run check`): **PASS**
- Production build (`npm run build`): **PASS**
- `git diff --check`: **PASS**
- Independent read-only reviews: **Action/held semantics, sign-out restoration, performance, release scope, and order-flow evidence reviewed; no remaining blocker**

## Explicit exclusions

No catalog-data release, pricing change, payment or fulfillment automation, environment change, database migration, production order, production deployment, or rollback is part of this RC.

The branch may be deployed only after the founder approves the exact origin-verified freeze SHA.
