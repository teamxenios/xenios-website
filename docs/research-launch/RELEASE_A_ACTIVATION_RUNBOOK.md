# RELEASE A ACTIVATION RUNBOOK — minimum live order intake (draft 2026-08-19)

STATUS: RC SHA pending lane integration + gates. Every production step below
is founder-approval-gated for the EXACT final SHA; nothing here executes on
historical authorization. Supersedes nothing: this extends
`.xenios/PHASE_ZERO_PRODUCTION_PACKET.md` (the M71 packet) with the Release A
additions.

## What Release A turns on

1. Assisted-order intake (the Phase Zero bridge) — the emergency order path.
2. Referral capture + durable affiliate attribution on requests
   (commission candidates stay `pending_program` until the founder activates
   the program economics).
3. Admin operator surfaces: assisted-order queue (existing), payment review +
   dispatch/tracking UI (fulfillment lane).
4. The approved manual payment lane (EA) for converting requests to paid
   canonical orders behind named-admin verification.

## Founder pre-approval checklist (answer before activation)

- [ ] Approve the exact Release A RC SHA: ________ (recorded after gates)
- [ ] Approve M71 application (packet steps; checksum re-verified at the RC SHA)
- [ ] Approve RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com
- [ ] Approve the EA payment/settlement env chain (RESEARCH_EARLY_ACCESS_ENABLED,
      OWNER_ID, SESSION_IDENTITY, CART flag if cart intake is wanted at A,
      REQUIRED_AGREEMENTS, payment-instructions + method registry env)
- [ ] Approve RESEARCH_PARTNER_LINK_SECRET creation (server-only secret for
      signed referral codes/cookies; fails closed absent)
- [ ] Decide affiliate flag state at A: AFFILIATE_PORTAL_ENABLED now or after
      first orders (capture works either way; the portal is read-only)
- [ ] Bucket `research-assisted-order-documents` (private): create before the
      first admin identity-document request — NOT an intake blocker

## Activation sequence (execute only with the approvals above)

1. Freeze: clean tree at the exact RC SHA; re-run full gates on it.
2. Verify production predecessor is still 458e7284 and no competing writer.
3. Apply M71 only; run its postcheck (five tables, forced RLS, zero grants,
   RPC-only) — containment per rollback notes on any failure.
4. Set the admin email; leave every feature flag off; verify running release
   unchanged.
5. Dark deploy the exact RC SHA. Smoke the existing site: home, /research,
   sign-in, member catalog, Early Access, admin, partner, Care shell, API
   health. Assisted-order doors must refuse (flag off).
6. Set RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true; redeploy same SHA.
7. MOBILE SMOKE (P0, on the live dark/enabled site) at 430/390/375/360/320:
   research entry -> catalog -> product -> order request wizard (multi-line,
   quantities, prices show approved amounts, never $0) -> contact ->
   shipping -> agreements -> review -> submit -> XRR confirmation -> status
   page. Fix functional blockers before widening.
8. Controlled test request (marked as test; never marked paid/shipped unless
   real): verify durable row, admin queue, notification outbox intent,
   privacy boundaries, status read.
9. Referral capture test: open /r/<test-code> and ?ref=<test-code> -> cookie
   set -> sign in -> submit request -> verify affiliateAttributionRef stored
   server-side; invalid code -> journey unaffected, nothing stored.
10. Set the EA payment env chain (approved values); verify payment
    instructions render, proof upload path, named-admin verification, and
    that ONLY the authorized operator can mark paid.
11. Fulfillment pass on the test order: supplier packet read, tracking entry,
    shipped; verify customer status shows tracking.
12. Record: deploy ID, SHA, migrations, smoke results, rollback (flag off
    first; runtime rollback to 458e7284 only if necessary; committed rows
    always preserved).
13. Move immediately to Release B (Buy Now readiness subset).

## Rollback

Flag(s) off first — doors refuse, site otherwise byte-identical; preserve
every committed request row; redeploy 458e7284 only if runtime rollback is
truly required. Never drop M71 objects.
