XENIOS CODEX FLEET DISPATCH - CODEX 6

ROLE: WRITER (scoped to the LIVE lane)
PROMPT FILE: 06_CODEX_ADMIN_FULFILLMENT.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex6-admin-ops -b codex/admin-fulfillment-ops-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/admin-fulfillment-ops-20260820

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
client/src/research/pages/adminx early-access operations surfaces (extend the EarlyAccessFulfillment.tsx family), ADDITIVE factories in server/research/early-access/routes/admin-routes.ts, customer status projections, focused tests.

FORBIDDEN PATHS (another writer or the lead owns these):
server/research/fulfillment/** (the undeployed engine - DIRTY in a paused Claude worktree, and its migrations 42/43 are NOT in production); client/src/research/adminx-section.tsx route lines (LEAD SEAM - send snippets); any production mutation.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
CRITICAL ROUTING FACT: the LIVE launch fulfillment path is the EA DISPATCH lane (admin UI /admin/research/early-access/fulfillment plus mounted endpoints), NOT server/research/fulfillment/** (that engine is undeployed; its migrations are not in production, and a paused Claude worktree holds uncommitted edits to it). Build the OPERATING QUEUE over the LIVE lane.
Your P0: a working admin queue - new XRR request -> review (with the AFFILIATE CODE visible, founder requirement) -> quote/payment review -> convert -> supplier assign -> acknowledge -> packing -> tracking -> shipped/delivered -> exception/replacement/refund; plus the truthful CUSTOMER status projection (reference, items, retail total or quote state, payment state, fulfillment state, tracking, next action).
Enforce: unpaid cannot release; tracking is not the same fact as shipped; customer A can never read customer B (404 not 403 - never an existence oracle); no supplier cost or margin reaches any customer or non-authorized surface; no unsafe freeform state editing (only legal transitions).
A prior reconciliation reported SIX BROKEN ADMIN PAGES. Identify them exactly, state which block today's P0, and fix only those inside your owned paths - report the rest to the lead.

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
# CODEX 6 — ADMIN + FULFILLMENT + TRACKING

Goal:
Make Early Access business operable.

Admin:
review request
view affiliate code
quote/payment review
convert to order
assign supplier
acknowledge
packing
tracking
shipped/delivered
exception/replacement/refund

Customer status:
reference
items
retail total/quote state
payment state
fulfillment state
tracking
next action

Rules:
unpaid cannot release
tracking != shipped
customer A cannot read B
no supplier cost/margin leakage
no unsafe freeform state editing

Reuse existing EA dispatch/fulfillment authority rather than duplicating it.
