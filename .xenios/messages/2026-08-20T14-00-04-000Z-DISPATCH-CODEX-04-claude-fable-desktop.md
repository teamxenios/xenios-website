XENIOS CODEX FLEET DISPATCH - CODEX 4

ROLE: WRITER
PROMPT FILE: 04_CODEX_EMAIL_OUTBOX.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex4-order-emails -b codex/order-emails-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/order-emails-20260820

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
server/research/assisted-order/communications.ts (renderers), the notification payload block inside server/research/assisted-order/service.ts submit path, notification/template modules where isolated, focused tests.

FORBIDDEN PATHS (another writer or the lead owns these):
server/index.ts outbox worker composition (LEAD SEAM); server/research/outbox.ts worker internals unless you find a defect (report it, do not restructure); any real email send.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
LEAD AUDIT - THE SPINE ALREADY EXISTS END TO END. Do NOT create a second notification architecture.
- Submit already enqueues BOTH intents idempotently: server/research/assisted-order/service.ts ~460-495, dedupe keys assisted-order:<requestId>:submitted:{admin,customer}; idempotent replay never re-enqueues (~436).
- Worker is LIVE in production (verified in Render logs 2026-08-19T20:43Z, 60s interval), started at server/index.ts:1090, renders via renderAssistedOrderOutboxEmail (server/research/outbox.ts:380), sends through the Resend client.
- Privacy allowlist AT RENDER TIME in communications.ts: each template reads explicit fields and ignores everything else. PRESERVE that property.
- Admin recipient is server-configured: env RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL (server/research/assisted-order/production-deps.ts:33), already set in production to research@xeniostechnology.com. Never hardcode a recipient anywhere client-side.
YOUR REAL SCOPE - ENRICH THE TWO SUBMIT TEMPLATES to the founder's required content:
- Customer today has: reference, line COUNT, estimated total, status link. MISSING: per-line product/variant/quantity, RETAIL unit+line money, payment status, explicit next step.
- Admin today has: reference, name+email, line count, estimate, workflow modes, admin link. MISSING: per-line products/variants/quantities with RETAIL pricing, AFFILIATE CODE, payment state, next action.
Mechanics: enrich the enqueue payload with a customer-safe line projection from the ALREADY-RESOLVED authoritative lines (retail only); bump templateVersion v1->v2 in the SAME change as the renderer; keep template KEYS stable; renderers must still render already-enqueued v1 rows (the allowlist ignores missing fields - keep that). Make affiliateCode an OPTIONAL payload field that renders only when present, so you do not block on the affiliate lane.
NEVER include wholesale/supplier cost, margin, internal notes, credentials, shipping address, or document bytes. Prove: no double-send on replay, order persistence survives outbox failure, null admin recipient degrades safely, no real send can fire from tests/dev, and customer-controlled strings cannot inject email structure.

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
# CODEX 4 — CUSTOMER + ADMIN ORDER EMAIL OUTBOX

Goal:
Every persisted Early Access request/order creates two idempotent durable outbox intents:
1. customer confirmation
2. Xenios admin/founder alert

Reuse existing outbox. Do not create another queue.

Customer-safe:
reference, items, quantities, retail price/quote state, payment status, next step/status link.

Admin:
reference, customer summary, items, quantities, retail price state, affiliate code, payment state, secure admin link.

Never expose wholesale, supplier cost, margin, credentials or sensitive docs.

Provider failure must not roll back order.
Replay must not double-send.
Tests/dev must not send real email.
Do not hardcode admin recipient in frontend.
