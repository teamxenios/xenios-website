# Phase Zero production execution packet — REPLACEMENT CANDIDATE 2026-08-19 (NOT YET FOUNDER-APPROVED)

STATUS 2026-08-19 (supersedes the header below it): the founder's
2026-08-19 unblock directive authorizes executing the Release A sequence once
the lead freezes the exact Release A RC SHA and the gates are green or every
residual failure is proven pre-existing/non-runtime — "without another broad
founder-decision pause". The Release A Addendum at the end of this file names
the deltas; the RC SHA is recorded there at freeze. Fleet Session 10
(release/security QA) carries the independent adversarial function in
parallel; PR #305 remains open for asynchronous review of the wiring repair
lineage.

## Supersession

The 2026-08-16 approval for 32bbd7998e806d881590c9e9a32123c2b8ba8168 is
SUPERSEDED and MUST NOT be executed. The 2026-08-18 recovery packet found two
production composition defects in that candidate:

- Defect A: the canonical legal port was constructed in
  buildAssistedOrderProduction and dropped before the service, so every
  submission refused with legal_requirements_unavailable even after M71, the
  admin email, the deploy, and the flag.
- Defect B: the server-authorized pricing viewer never rode the assisted-order
  viewer, so the approved-price authority failed closed and the survey showed
  "Price on request" over 417 approved member prices.

Both are repaired, regression-locked, and committed on
fix/phase-zero-assisted-order-wiring-20260818.

## Candidate targets (approval must name these exactly)

- RELEASE SHA (runtime candidate): c318ec9029378bb2dfdc391226263f6414487260
  (branch fix/phase-zero-assisted-order-wiring-20260818, base
  78f3482c25e233c8a2cafca6f0c956fcc9ac03d8 = claude/assisted-order-bridge head)
- INTENDED RC TAG (created only after independent review + CI):
  RESEARCH_PLATFORM_0_5_ASSISTED_ORDER_RC2
- M71: supabase/migrations/20260815150000_research_assisted_order_bridge.sql
- M71 SHA256 (re-hashed AT the candidate SHA, 2026-08-19, identical to the
  canonical MIGRATION_DAG value):
  da60e8b0f0d66625ff72f687f3386c45edaf27f5fc5f020e9137f7e6d486091a
- DOCUMENT BUCKET: research-assisted-order-documents (private) — DOES NOT
  EXIST in production yet; creation is now an explicit approved step below.
- ADMIN EMAIL: RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com
- FLAG: RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true
- Supabase project: yvzeduaxbwgcwllhywff
- Render service: srv-d8s9vej7uimc7384dfcg (workspace tea-d8nhh6a8qa3s73f4ocj0)
- Production predecessor / first containment redeploy target:
  458e7284c12cfbd95bd91371afb88cb8a6201454
- Release manifest: docs/coordination/PHASE_ZERO_WIRING_RC_MANIFEST.json

## Pre-flight, VERIFIED 2026-08-19 by claude-fable-desktop (re-verify before each mutation)

1. Local head of claude/assisted-order-bridge equals origin and the expected
   78f3482c...; 32bbd799... and 458e7284... are both verified ancestors.
2. The candidate c318ec90... is exactly eleven files beyond 78f3482c...: the
   two wiring repairs, four regression/test files, one new shared derivation
   module, and the documented server/index.ts seam-baseline move.
3. M71 bytes at the candidate SHA hash to exactly the approved SHA256 above.
4. READ-ONLY production checks (executed 2026-08-19, no mutation): production
   database has ZERO research_assisted_order% tables (clean first apply) and
   storage.buckets has NO research-assisted-order-documents bucket (must be
   created, private, before flag enablement — new step 2 below).
5. The untracked local .mcp.json was never committed. No credential enters
   this branch.

## Gate evidence at the exact candidate SHA (2026-08-19)

- Focused suites: PASS — 332 passed / 13 skipped across
  server/research/assisted-order/ and server/research/master-offerings/,
  including the four new suites (production-wiring, pricing-seam, http-e2e,
  member-pricing-viewer).
- Full suite: PASS — npx vitest run: 9551 passed / 43 skipped / 0 failed
  (the single interim failure was the leased server/index.ts seam hash,
  resolved by the documented CORE_SITE_PROTECTION_MANIFEST baseline note;
  server/core-site-protection.test.ts re-run green 32/32).
- Typecheck: PASS (npm run check). Build: PASS (npm run build).
- Release control plane: PASS (check + 35 tests).
- Migration DAG: PASS (30 nodes, canonical checksums).
- Route uniqueness: PASS (385 registrations, unchanged by this diff).
- verify:production-state: PRE-EXISTING FAIL (four STALE_EVIDENCE items aged
  past their window after the 2026-08-17 drift; identical failure at the
  untouched base 78f3482c). Refresh requires live production verification
  inside the approved execution window — step 0 below.
- verify-core-site-protection.mjs: PRE-EXISTING FAIL vs origin/main (the
  branch's accumulated continuity-corpus/PWA files outside Research/Care
  zones; identical at the untouched base). This diff adds no new out-of-zone
  runtime file. The vitest seam gate is green.
- verify:release-manifest: all structural, SHA-binding, diff-exactness,
  route, migration, test, rollback, smoke, and evidence checks PASS. 99
  UNOWNED_FILE findings remain and are STRUCTURAL: the verifier reads
  FILE_OWNERSHIP.json from the trusted BASE commit (458e7284), whose ledger
  (generated 2026-08-03) predates the assisted-order lane entirely. No edit
  in this branch can cure that run. The refreshed ownership rule
  OWNER-PHASE-ZERO-ASSISTED-ORDER-WIRING-20260819 ships IN this release so
  the next release verifies against a coherent base ledger. The independent
  reviewer must accept this residual explicitly.

## Named Phase Zero limitation (decision recorded in code review, not marketing)

auditWrite remains application-log based at this SHA. The durable business
record for every request, line, document, and status transition is M71's
append-only research_assisted_order_events ledger (trigger-guarded, RPC-only),
so the log sink duplicates operational telemetry only. REQUIRED FOLLOW-UP
(release-blocking for Release B payment states, not for Phase Zero intake):
wire a durable structured research audit repository.

## Execution order (only after CURRENT founder approval of the exact SHA; fail-safe: no intermediate step shows a working-but-broken form)

0. Re-verify the production predecessor is still 458e7284 (no competing
   writer, no new manual deploy), and refresh the stale production-state
   evidence documents from this live verification.
1. Apply M71 via the approved process (Supabase MCP apply_migration), then run
   the M71 production postcheck. Verify: five tables, RLS enabled AND forced,
   zero direct grants, RPC-only boundary, routines present, no unrelated
   object changed, no business row written. On failure: STOP, contain per
   supabase/production/research-assisted-order-bridge-rollback-notes.md.
2. Create the PRIVATE storage bucket research-assisted-order-documents
   (public=false) through the approved process; verify public=false and that
   no anonymous policy exists on it.
3. Set RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com.
   Leave the bridge flag unset. Confirm the running release is unchanged.
4. Deploy EXACTLY c318ec9029378bb2dfdc391226263f6414487260. Verify the deploy
   object's commit, health, core site, Research gateway, Early Access, member
   catalog, and that every assisted-order door REFUSES because the flag is
   unset (CTA advertises nothing).
5. Set RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true and redeploy the SAME SHA.
   No code change during enablement.
6. Run the controlled live smoke per the manifest's smoke block, including the
   two pricing proofs the defects would have failed: an active member sees a
   canonical approved price; an Early Access session without a grant sees
   "Price on request", never $0.
7. Verify customer receipt, durable XRR row, admin queue, notification outbox
   intent (dedupe key present), privacy boundaries, and status read.

## Test-order rule

Do not create fake commercial facts. The test request may stay marked as a
test. Never mark it paid, supplier assigned, shipped, delivered, agreements
complete, or identity verified unless that actually happened. Close it through
the truthful supported path afterwards.

## Fail-safe

First containment on any release-blocking issue:
RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=false, verify the doors refuse again,
and only then debug. Preserve every committed request row. If needed, redeploy
the verified production predecessor 458e7284 (b0fe3963722665dcd7e8853f05f637bc09960a56
remains the next-older fallback). Never drop M71 objects while any request row
exists.


## RELEASE A ADDENDUM — 2026-08-19 (founder unblock directive)

The founder's 2026-08-19 unblock directive AUTHORIZES executing the Release A
sequence after exact-SHA freeze without a further founder pause, and approves:
manual payment for Release A, admin-driven fulfillment, the retail price book
as the target schedule for the 34 exact-matched variants (controlled release,
canonical RPCs, artifact docs/research-launch/PRICE_RELEASE_2026-08-19.sql),
the affiliate program configuration (20%/7.5% months 2-12/21-day hold/$50
minimum/biweekly Friday; activation via AFFILIATE_PROGRAM_ENABLED), and SQL
A/B/C through the release train (now promoted: migrations 72-74, adversarial
review PASS, applied twice on disposable PostgreSQL 16+17 via
scripts/verify-20260819-cart-migrations.sh).

RELEASE A RC (FROZEN 2026-08-19): 50a188ea7e6f70d8390e6e626c7a32a1c9ab8cfa
(xenios/launch-integration-20260819; runtime gates ran green at 5093267
and the delta to the frozen tip is the packet/status docs, the control-plane
source-pin registration, and line-ending normalization — non-runtime,
verified by diff). The runtime candidate
SUPERSEDES c318ec90 as the deploy target; every guarantee of the earlier
candidate is contained in it (verified ancestry) plus the launch lanes.

Release A execution deltas vs the base packet sequence:
- Deploy target: the frozen Release A RC SHA via fast-forward of
  release/early-access-code-session-checkout and an explicit Render deploy
  (autoDeploy off, verified).
- Step 2 (bucket) stands, but is NOT an intake blocker: uploads occur only
  after an admin-initiated identity request; create the bucket before the
  first such request.
- New env at flag time: RESEARCH_PARTNER_LINK_SECRET (freshly generated,
  never committed), AFFILIATE_SYSTEM_ENABLED=true, AFFILIATE_CODES_ENABLED=true,
  AFFILIATE_PORTAL_ENABLED=true, AFFILIATE_PROGRAM_ENABLED=true.
- After dark-deploy smoke: execute the controlled price release (34 variants,
  one transaction, canonical create->approve RPCs), recording before/after.
- Migrations 72-74 are NOT applied at Release A (their consumers are the cart
  lane, Release B); they ride the runtime as PENDING. The M58 service_role
  revoke candidate (20260819_research_ea_cart_service_role_revoke) awaits its
  own founder approval.
- Mobile smoke per the activation runbook step 7 is a release-blocking check.
