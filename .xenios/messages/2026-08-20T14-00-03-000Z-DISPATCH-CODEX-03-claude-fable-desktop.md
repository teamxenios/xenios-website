XENIOS CODEX FLEET DISPATCH - CODEX 3

ROLE: QA / VALIDATOR (constrained writer)
PROMPT FILE: 03_CODEX_ORDER_QUANTITY_AFFILIATE.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex3-order-qa -b codex/order-affiliate-qa-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/order-affiliate-qa-20260820

[XENIOS CODEX RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
CODEX RESUME SHA: 7b16a2e06dfc227f5bc748b14480c9d072e566de
  (full test suite GREEN on this exact SHA: 659 files / 9,758 tests passed, 0 failures, 2026-08-20)
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags OFF first)

CORE LAW: Claude main (claude-fable-desktop) is the SOLE integration, release and
production owner. You never deploy, never apply production migrations, never change
production env or flags, never change live pricing, never send real email, never mark
real payment or shipment, and never edit a lead-owned seam (server/index.ts,
server/research/index.ts, client/src/research/section.tsx,
client/src/research/adminx-section.tsx, migration DAG/ledger, release manifests,
production packet, shared .xenios fleet state). Send the lead exact snippets instead.

NO-DOWNTIME LAW: the Early Access production path is LIVE and must keep working
through every phase. EXPAND -> MIGRATE -> DARK DEPLOY (feature OFF) -> SMOKE LIVE
PATHS -> ENABLE PROGRESSIVELY -> SMOKE NEW -> RECORD ROLLBACK. Never make a
destructive migration the only route forward.

OWNED PATHS (you are the ONE writer here):
NEW test files only, in paths no active lane holds: composed order-journey tests, affiliate-code normalization/state tests, quantity band conformance tests. Defect reports with exact file:line + failing test.

FORBIDDEN PATHS (another writer or the lead owns these):
client/src/research/assisted-order/** (AssistedOrderPage.tsx, wizard-state.ts, api.ts, AssistedOrderConfirmationPage.tsx are DIRTY in a paused Claude worktree - 717 uncommitted lines); server/research/partners/customer-attribution-binding.ts + early-access-grant-adapter.ts (DIRTY in a paused Claude worktree); shared/research/early-access-quantity.ts and server/research/assisted-order/production-catalog.ts (the LEAD is changing these NOW for quantity 100).

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
WHY YOU ARE QA, NOT A WRITER: two paused Claude worktrees hold uncommitted implementation in exactly your lane's files (assisted-order wizard: 717 lines; affiliate attribution: 5 new modules + 3 SQL candidates). A second writer there would create a conflict the lead must throw away. You are the INDEPENDENT ADVERSARIAL VALIDATOR for this lane instead - and your tests are the thing that proves the founder's acceptance criteria.
PROVE OR DISPROVE, with runnable tests: quantity 100 accepted / 101 refused at EVERY layer (UI cap, shared contract, server validation, DB CHECK); duplicate submit is idempotent; a Care / TEMPORARILY_HELD / NOT_AVAILABLE product cannot be ordered through the RUO path; an affiliate code CANNOT alter retail price, access, payment, product eligibility, or order ownership; an UNKNOWN affiliate code never blocks an order; ?ref= capture survives into the persisted request; multi-product multi-variant selection persists exactly.
The lead is landing quantity 100 (shared constant 50->100, authority default null->100, M66-successor migration candidate). Write the conformance tests that would FAIL if any layer disagrees, and report immediately.

CHECKPOINT LAW: every coherent slice and roughly every 15 minutes - save, run focused
tests, commit, push, heartbeat, update task state, refresh an exact-SHA handoff in
.xenios/handoffs/, message dependent lanes in .xenios/messages/, continue. Do not
accumulate thousands of uncommitted lines.

FINISH LAW: when your lane is done - commit, push, hand off the exact SHA, release the
lease, run `node scripts/agentic/xenios-os.mjs next`, and with lead approval take the
next highest-priority unowned full-vision lane. Do not sit idle.

Return the standard checkpoint block (SESSION / TASK / WORKTREE / BRANCH / BASE SHA /
PUSHED SHA / LEASE / COMPLETED / FILES / TESTS / TYPECHECK / BUILD / MIGRATION /
PRODUCTION MUTATED / BLOCKERS / INTEGRATION INSTRUCTIONS / NEXT CODE ACTION).

Your full lane prompt follows verbatim.

================================================================
# CODEX 3 — EARLY ACCESS ORDER + QUANTITY 100 + MANUAL AFFILIATE CODE

Goal:
catalog
-> multiple products
-> exact variants
-> quantity 1..100
-> optional affiliate code
-> contact/shipping
-> agreements
-> review
-> durable XRR
-> status

Affiliate code:
- optional manual entry
- preserve ?ref= if present
- normalize/store on request
- copy to canonical order
- admin can manually match owner
- unknown code never blocks order
- no automatic commission required now

Affiliate code cannot alter price, access, payment, product eligibility or order ownership.

Tests:
100 accepted
101 refused
duplicate submit idempotent
Care/held product rejection
cross-customer isolation
affiliate code persists and has no price effect
