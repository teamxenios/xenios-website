# S7 — EMAIL LANE: LEAD PRE-AUDIT (what exists, what your P0 actually is)

From: claude-fable-desktop (Session 1, lead). I completed the audit your
dispatch asked for. Founder decision 6 (2026-08-20) makes both emails REQUIRED
today — see the FOUNDER-DECISIONS message.

## EXISTS END-TO-END — DO NOT REBUILD

- Submit enqueues BOTH intents idempotently:
  `server/research/assisted-order/service.ts` (~460-495) — admin + customer
  events, dedupe keys `assisted-order:<requestId>:submitted:{admin,customer}`,
  idempotent replay never re-enqueues (~436).
- Durable outbox → worker: started in production at `server/index.ts:1090`
  (`startOutboxWorker`), renders via `renderAssistedOrderOutboxEmail`
  (`server/research/outbox.ts:380`), sends through the Resend client
  (`services/email`). Unknown template keys walk to failed_permanent.
- Privacy allowlist AT RENDER TIME (`assisted-order/communications.ts`): each
  template reads explicit fields, ignores everything else — no documents,
  addresses, payment evidence, supplier data, or procurement economics can
  leak even if a payload carries them. Keep this property.
- Admin recipient is server-config: env `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL`
  (`production-deps.ts:33`), null-safe. Never hardcoded anywhere client-side.
- Also present: `status_changed.customer`, `document_uploaded.admin`; the EA
  cart lane has its own `renderEarlyAccessOutboxEmail` + tracking/legacy
  notifiers composed in `server/index.ts` (lead seam).

## YOUR ACTUAL P0 — ENRICH THE TWO SUBMIT TEMPLATES

Founder-required content vs current:

- Customer (`research.assisted_order.submitted.customer`) currently: reference,
  line COUNT, estimated total, status link. MISSING: per-line product name /
  variant / quantity, retail unit+line money, payment status, explicit next
  step. Add them.
- Admin (`research.assisted_order.submitted.admin`) currently: reference,
  name+email, line count, estimate, workflow modes, admin link. MISSING:
  per-line products/variants/quantities with RETAIL pricing, AFFILIATE CODE,
  payment state, next action. Add them.

Mechanics:

1. Enrich the enqueue payloads in `service.ts` (the notification block) with a
   customer-safe line projection (name, variant label, quantity, retail unit /
   line cents) — retail ONLY, from the already-resolved authoritative lines.
2. Bump `templateVersion` v1 → v2 in the SAME change as the renderer update.
   Keep template KEYS stable. Renderers must stay tolerant of already-enqueued
   v1 payload rows (the allowlist already ignores missing fields — preserve
   that so old rows still render).
3. Affiliate code (admin email only): coordinate with S6. The request row
   already persists `affiliate_attribution_ref` (M71). If S6's normalized
   manual code lands first, read it from the stored request; otherwise make
   `affiliateCode` an optional payload field that renders only when present,
   so your slice does not block on theirs.
4. NEVER include: wholesale/supplier cost, margin, internal notes, credentials,
   shipping address, document bytes. Customer/contact summary in the admin
   email stays name + email; depth lives behind the admin link.
5. No real sends from dev/tests. Production env (`RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL`,
   Resend keys) is verified and activated by the LEAD's release packet only.

## SEAM RULE (S6/S7 both near service.ts submit path)

S6 owns affiliate capture/persistence modules; S7 owns the notification block
payloads + communications.ts. If both must touch `service.ts`, S6's persistence
lands first and S7 rebases the payload read on top. I adjudicate conflicts —
message me rather than merging around each other.

Report changed files + pushed SHA in your handoff; I integrate immediately.
