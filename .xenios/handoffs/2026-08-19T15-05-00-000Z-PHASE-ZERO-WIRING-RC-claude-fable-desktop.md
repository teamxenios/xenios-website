# Handoff: Phase Zero wiring repair RC (claude-fable-desktop, 2026-08-19)

## Task

Repair the two Phase Zero production-composition defects named by the founder's
2026-08-18 recovery packet, add the missing regression layers, run every
repository gate, and produce the replacement production packet. NO production
mutation performed; two READ-ONLY Supabase preflight SELECTs only.

## Exact SHAs

- Base: 78f3482c25e233c8a2cafca6f0c956fcc9ac03d8 (claude/assisted-order-bridge
  head, verified == origin)
- Runtime candidate: c318ec9029378bb2dfdc391226263f6414487260
  (branch fix/phase-zero-assisted-order-wiring-20260818, 11 files)
- Production predecessor (unchanged): 458e7284c12cfbd95bd91371afb88cb8a6201454
- Superseded prior RC: 32bbd7998e806d881590c9e9a32123c2b8ba8168 — DO NOT DEPLOY

## What changed (runtime commit c318ec90)

1. Defect A: AssistedOrderProductionInputs gains a REQUIRED `legal` field;
   buildAssistedOrderProduction passes the canonical Early Access legal port
   through to AssistedOrderService. Null still composes fail-closed (D-005).
2. Defect B: AssistedOrderViewer declares opaque `pricingViewer`; the express
   member resolver carries it from the wiring; server/index.ts derives it from
   the SAME authenticated member row via the new single derivation module
   server/research/master-offerings/member-pricing-viewer.ts (also adopted by
   the v2 catalog doors); identityFor is null-safe so grant-less viewers price
   as "Price on request", never $0, never a throw.
3. Seam: server/index.ts baseline moved with a dated review note in
   docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json (three hunks documented).
4. New suites: production-wiring.test.ts (composition-level legal + no memory
   fallback + composed submit/XRR + cross-customer refusal + leak scan),
   assisted-order-pricing-seam.test.ts (real resolver -> real composition ->
   real price authority: member 9900, EA request_pricing),
   http-e2e.test.ts (config -> catalog -> submit -> XRR -> status -> guarded
   admin queue over real Express doors), member-pricing-viewer.test.ts.

## Docs commit (after runtime candidate)

- Replacement packet: .xenios/PHASE_ZERO_PRODUCTION_PACKET.md (supersession,
  new preflight facts, bucket-creation step, audit limitation, gate evidence).
- Release manifest: docs/coordination/PHASE_ZERO_WIRING_RC_MANIFEST.json
  (base 458e7284, head c318ec90, 107 files, 10 routes, M71 checksum).
- Ownership refresh: OWNER-PHASE-ZERO-ASSISTED-ORDER-WIRING-20260819 rule in
  docs/coordination/FILE_OWNERSHIP.json (cures FUTURE bases; the current
  verify:release-manifest run reads the ledger frozen at 458e7284 and its 99
  UNOWNED_FILE findings are a documented structural residual for the reviewer).
- .xenios PROJECT_STATE/RELEASE_STATE updated; session heartbeats current.

## Gates at c318ec90 (all commands actually ran)

PASS: focused suites (332), full vitest (9551/0 fail), npm run check,
npm run build, check:release-control-plane, test:release-control-plane (35),
verify:migration-dag (30 nodes), verify:route-uniqueness (385),
core-site-protection vitest seam gate (32/32 after documented baseline move).
PRE-EXISTING FAIL (identical at untouched base): verify:production-state
(4 stale evidence docs; refresh needs the live execution window),
verify-core-site-protection.mjs vs origin/main (accumulated corpus/PWA files).
PARTIAL: verify:release-manifest — everything passes except the structural
UNOWNED_FILE residual described above.

## Production preflight (READ-ONLY, 2026-08-19)

- research_assisted_order% tables: ABSENT (M71 clean first apply).
- storage bucket research-assisted-order-documents: ABSENT — creation added
  as approved packet step 2.

## Next (in order)

1. Push branch, open PR against claude/assisted-order-bridge so GitHub CI runs.
2. Independent exact-SHA review of c318ec90 (review must explicitly accept the
   UNOWNED_FILE residual and the audit-sink limitation).
3. Freeze tag RESEARCH_PLATFORM_0_5_ASSISTED_ORDER_RC2 after review + CI.
4. Samuel's CURRENT approval of the exact SHA and packet.
5. Execute the packet steps 0-7. STOP at any deviation.
6. While approval is pending: continue non-production lanes (request/quote
   conversion per ACTIVE_TASKS, supplier workspace, UX) — do not idle.
