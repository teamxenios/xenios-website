# Operations and Affiliates — Seven-Lane V2 Check-in

- Session: WEBSITE 4 — Operations, Fulfillment, and Affiliates
- Writer: one writer in the isolated Website 4 worktree
- Active unit: post-takeover operations and affiliates
- Exact build base: `2891dcb9ded41e6007f636bf053cd090dcd16111`
- Production reference: `2891dcb9ded41e6007f636bf053cd090dcd16111`
- Live Render reference: `dep-d9jrif741pts73bhfmm0`
- PR #104 ancestry: prohibited; this replacement is rebuilt directly on current main
- Branch: `feature/website-4-takeover-operations-fulfillment-affiliates`
- PR: pending one draft PR for this unit
- Commit shape: exactly two bounded commits
- Production authority: Website 2 only; this session performs no migration application, merge, Render action, or production write

## Owned files

- New `server/research/operations/**`
- New `server/research/fulfillment/**`
- New `server/research/affiliates/**`
- New `shared/research/operations/**`
- New `shared/research/fulfillment/**`
- New `shared/research/affiliates/**`
- New `client/src/research/operations/**`
- `client/src/research/pages/adminx/Fulfillment.tsx` and focused tests only
- `server/research/providers/fulfillment.ts` and focused tests only
- New, uniquely timestamped Website 4 migrations and disposable verifiers
- This check-in plus new Website 4 handoff and machine-manifest evidence

## Forbidden files and scope

- `server/index.ts`
- `client/src/App.tsx`
- `client/src/research/section.tsx`
- `client/src/research/adminx-section.tsx`
- `server/research/commerce/production-deps.ts`
- Product and catalog source
- Cart, checkout, and order orchestration
- Product Control transactional wiring
- Central routes, auth, capabilities, navigation, and migration ledger
- Existing takeover migrations
- Care and clinical code
- Stale PR #48 wholesale integration
- Production migrations, production data, secrets, deploys, and fabricated records

## Commit 1 — launch critical

Restricted assigned-order fulfillment; SKU, quantity, exact lot, label, packing,
shipping, tracking, returns, damage, loss, recall, and exception lifecycle;
second-supplier onboarding; supplier-specific offers, assignments, settlements,
and cross-supplier isolation. Command-managed mutation is RPC-only with forced
RLS, exact grants, fixed search paths, append-only audit, idempotency, and
concurrency controls.

## Commit 2 — broader operations

Affiliates, links, attribution, commissions, statements, professional accounts,
CRM, Lawrence configuration, and the operations command center and analytics.

## Validation checkpoint

- Clean direct ancestry from exact build base: PASS
- Focused correction tests: PASS (`8/8`)
- All owned TypeScript fulfillment/supplier/affiliate/UI tests: PASS (`31/31`)
- Previously accepted broader focused lane: PASS (`79/79`)
- Typecheck: PASS
- PostgreSQL production-shaped apply-twice/security/concurrency/rollback
  evidence: PASS
- Deployed fulfillment-table collision and grant preservation: PASS
- Summed multi-lot allocation and product/variant/sorted-lot races: PASS
- Paid-order/refund-derived attribution and immutable Lawrence terms: PASS
- Exact statement inclusion, locking, and supersession: PASS
- Exactly-one-current Lawrence replacement, replay, concurrent edit, and
  injected-crash rollback: PASS
- Pinned hold/threshold enforcement and immutable payout evidence: PASS
- Immutable earning-period statement lineage and cross-period exclusion: PASS
- Full test suite: `3764 passed`, `1 skipped`, `1 pre-existing base timeout`
- Production build: PASS
- Browser: 375px, 320px, and 640px 200%-reflow proxy have no horizontal
  overflow, required landmarks are present, and console errors are zero

## Next 30–60 minute deliverable

Freeze the corrected two-commit head, publish the SHA-pinned machine manifest,
and request renewed Website 6 exact-SHA review. No integration, migration
application, merge, deploy, or production data action occurs in this session.

## SHA-pinned handoff

- Base SHA: `2891dcb9ded41e6007f636bf053cd090dcd16111`
- Current head: resolved from the authoritative SHA-pinned PR manifest after the final two-commit rewrite
- Commit 1 SHA: resolved from the authoritative SHA-pinned PR manifest after the final two-commit rewrite
- Commit 2 / final SHA: pending validation
- Machine manifest: pending final frozen head
