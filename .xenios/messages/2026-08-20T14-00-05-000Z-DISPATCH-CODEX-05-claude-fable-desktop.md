XENIOS CODEX FLEET DISPATCH - CODEX 5

ROLE: QA / VALIDATOR (constrained writer)
PROMPT FILE: 05_CODEX_QUOTE_PAYMENT_ORDER.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex5-payment-qa -b codex/quote-payment-qa-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/quote-payment-qa-20260820

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
NEW adversarial test files over the EXISTING committed quote engine (server/research/assisted-order/quote/**, currently unmounted) and the EA manual payment lane; migration CANDIDATES under supabase/candidates/ with evidence; defect reports.

FORBIDDEN PATHS (another writer or the lead owns these):
server/research/orders/** and shared/research/orders/** (DIRTY canonical-order scaffold in a paused Claude worktree); supabase/migrations/** and the DAG/ledger (LEAD-owned); any production mutation.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
WHY YOU ARE QA: a paused Claude worktree holds the uncommitted canonical-order scaffold (server/research/orders/, shared/research/orders/) in exactly your lane. Do not become a second writer there.
YOUR HIGH-VALUE WORK: the money-safety negative controls, as runnable tests against what EXISTS today.
Prove or disprove: the browser can never set a total or a unit price (server re-reads price authoritatively on submit); proof-of-payment is NOT payment (only a named authorized admin fact marks paid); a customer or affiliate can never mark paid; stale-price detection exists or is missing; a quote cannot be redeemed by a different customer; payment confirmation and order conversion are idempotent under replay; the sold-price snapshot is immutable after conversion; quantity 100 survives the whole conversion chain.
The committed quote engine is UNMOUNTED - state clearly which of these properties are proven, which are unreachable because it is unmounted, and exactly what mounting would require. That analysis is what the lead needs to sequence the release.

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
# CODEX 5 — QUOTE + MANUAL PAYMENT + CANONICAL ORDER

Goal:
XRR -> quote/current amount -> acceptance -> manual payment -> authorized paid -> one canonical order.

Requirements:
- durable quote/version/expiry
- canonical retail price
- stale-price detection
- browser cannot set total
- proof is not payment
- customer/affiliate cannot mark paid
- named authorized admin/provider fact only
- one canonical order
- request/quote lineage
- sold price snapshot
- affiliate code copied
- quantity 100
- idempotent payment confirmation/conversion

Do not apply production migrations. Return migration candidate/evidence to lead.
