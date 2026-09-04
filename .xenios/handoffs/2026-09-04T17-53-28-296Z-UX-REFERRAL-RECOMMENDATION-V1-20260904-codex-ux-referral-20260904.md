# Referral V1 local checkpoint — functional demonstration, mobile acceptance pending

The local 320px functional demonstration passed. This bounded checkpoint is ready
for handoff in QA, not full acceptance: the nine-width matrix and known install-
promotion overlap remain open for the separately requested PWA follow-up. It is
not a production attestation, migration approval or deployment request.

[ACTIVE XENIOS EXPERIENCE BUILD CHECKPOINT]

SESSION: codex-ux-referral-20260904

TASK: UX-REFERRAL-RECOMMENDATION-V1-20260904

WORKTREE: C:/Users/sboad/projects/xenios-ux-codex-20260904

BRANCH: codex/ux-continuation-20260904

BASE SHA: 306b2996feb27578fa5434f6a20810cc8f6d83db; tested auth code c93c48704c6842f6f65fdc0698cfb3fe627cad2e

CODE SHA: c5ac43907ffe024ffcba847fb761836211ae4118 (pushed; actual complete 320px browser demonstration; core implementation c9c81bb, API stream cleanup ef6c616)

PRODUCTION SHA: db5a2d447114c1e8a14185a9865ded50ee3f1ac6; read-only Render inspection confirmed live deployment dep-dad08h740ujc73aprfcg, service srv-d8s9vej7uimc7384dfcg, auto-deploy disabled. No production database inspection/application is implied.

JOURNEY IMPLEMENTED: Authorized Gen2 owner issues/copies/shares/revokes one opaque destination-aware link; recipient understands Care/Research, explicitly continues, authenticates when necessary, and retains safe intent and durable first-valid context.

SERVER AUTHORITY: Existing canonical member/admin guards, Auth-to-member-to-partner SQL ownership, active/certified/activated eligibility, strict registered-token authority, same-origin JSON, visitor CSRF, durable limiter and atomic idempotency/audit. New feature dark by default.

CLIENT UX: Contextual /r/:code, approved-partner own links at /research/partners/links, canonical member guard for exact private catalog/product destinations, recovery/support and honest unavailable/ineligible states. No automatic customer affiliate enrollment.

ATTRIBUTION: Existing Gen2 links/touches and intended account-binding table; immutable first visitor/account winners, current eligibility rechecked, one capture cannot bind two accounts, no self-referral or browser-declared identity authority. Existing xr_aff cookie name with isolated V1 format rejected by legacy money-bearing verification.

AUTH CONTINUITY: Existing closed returnTo policy reused. Signed visitor/capture locator survives normal auth; optional guarded member/me binding cannot elevate or block legitimate access. Claim remains activation-gated; recovery-only tokens cannot enter member data or establish binding.

ADMIN UX: /admin/research/referral-lifecycle exposes bounded authorized links/touches/bindings/events and post-bind member-owned request/order lineage, always account_binding_only. No correction writer, no pre-bind/EA-session-only lineage, no false conversion claim.

PARTNER / USER UX: Owner-only links and aggregate recorded captures/account bindings; no recipient contacts, no fake new-account/earnings status. Ordinary members cannot issue or inspect another partner's links; admin remains separately guarded.

MOBILE SHARE: 320px functional create/copy/simulated Web Share/fallback/failure/revoke PASS; 44px new controls and no horizontal overflow. Capability shims do not attest OS-share delivery. QR deferred (no existing renderer; dependency expansion not required for V1). Nine-width browser run pending. A pre-existing PWA install promotion visibly obscures part of the referral card and Health choice: retained P2 evidence, not a clean visual acceptance claim.

PRIVACY: /r document no-store/no-referrer/noindex, marketing/tracking isolation, opaque public URLs, server-held capture cookies, no clinical fields in referral DTOs, no financial writes. Browser uses real controller/SQL and synthetic local Auth only; no service-worker bypass.

NEGATIVE CONTROLS: Focused HTTP/guard/SQL/UI suites cover forged/invalid/revoked/expired tokens, safe destinations, strict extra-field refusal, idempotency, current ownership, cross-account isolation, self-referral, audit rollback, role/grant drift and lineage exclusions. Unimplemented corrections/economics are not represented as tested features.

FOCUSED TESTS: Latest broad focused run: 720 PASS, 16 opt-in database skips across 35 files (736 cases); the complete actual PostgreSQL suite separately passed 16/16 in 9.55s, including expired capture/historical-touch binding. HTTP strict-body suite included all 18 cases, including paid/fulfilled/payout/accountKey/verifiedReferrer refusal. Additional integration contract correction run: 139 PASS, 1 existing skip across core protection, release control plane and commerce acceptance. Successor API stream-cleanup/preview composition run: 23/23 PASS; preview wrapper correction rerun 8/8 PASS. Browser harness safety: 8 PASS. Local actual API smoke passed exact binding/claim/recovery/admin checks with zero outbound attempts. Skips are not counted as database passes.

TYPECHECK: npm run check PASS. Explicit preview-inclusive check found two guard-return typing errors at ef6c616; awaited wrappers fixed them in c5ac439 and the complete explicit check then reported zero diagnostics. Ordinary tsconfig excludes the preview roots; its pass was not used to hide those errors.

BUILD: npm run build PASS after API stream cleanup; production bundle index-DYgRgIb2.js. Browser records the entire bundle/source fingerprint, not this asset name alone.

FULL SUITE: Integration run: 834 files (828 passed, 6 failed), 12,580 tests (12,500 passed, 22 failed, 58 skipped). Five new failures were stale route/nav/legacy-controller contracts; all were corrected and their exact suites rerun green. Seventeen inherited supplier-clock failures remain unmodified. This is not a claim that a second full-suite run at the final frozen SHA has already passed. The 15 opt-in database cases skipped in the default run separately passed against real PostgreSQL.

BROWSER QA: FUNCTIONAL 320px PASS at c5ac439, 20 screenshots, 495 requests all exact loopback, zero outbound attempts/boundary violations/runtime exceptions, confirmed browser/profile and preview/database cleanup. Source fingerprint 6ade325985c1df208b8448e75be7bab0e4f83e409f6d5ca83e33e1b731659b7b and entire bundle fingerprint 5069e6fb51045747878ca29acea5496566a0dce5a70e62acd04b169d246cc464 match before/after. Actual SQL: 4 links/0 touches/0 bindings/4 events -> 8/3/3/15. Each persona has zero binding before fresh sign-in, exactly the expected first-valid link afterward; recovery-only and claimed-but-not-signed-in states do not bind. Claim remains activation-gated. Admin sees real attribution plus explicitly inserted synthetic downstream lineage, not a submitted/paid order. Evidence: docs/ux/referral-v1-20260904/browser-smoke-c5ac439-320/browser-results.json. Four failed diagnostic attempts are retained and explained; synthetic recovery URLs were redacted without changing results. Full nine-width matrix will run after the separate PWA policy fix; clean visual/mobile acceptance remains pending.

ROUTE UNIQUE: PASS, 421 static Express API registrations across 412 call sites at ef6c616; c5ac439 changes no production routes. Core-site gate PASS at ef6c616: 27 protected hashes plus all five declared seam hashes match; /r/:code explicitly inventoried, no unrelated marketing redesign.

SECRET SCAN: Automated diff scan reported 10 generic assigned-secret matches, all manually reviewed as synthetic UI test tokens, local preview password, or explicitly synthetic test signing keys. No live credential found; automated exit was findings, not a clean scan. Scanner was not weakened or bypassed.

PII SCAN: Out-of-repository name-list scan NOT RUN: no names file supplied/available. DTO and URL negative tests passed; this is not a substitute for a named-person/production PII attestation. Preview identities/contacts are synthetic only.

MIGRATION: Two local SQL candidates plus precheck/postcheck/rollout notes. Actual PostgreSQL 18.3 fresh/adoption, transaction, concurrency and grants rehearsals passed. Docker Desktop failed to start; checksum-verified portable Ubuntu packages ran only in fresh owned WSL clusters, with no system install/config repair or production connection. Candidates are not registered in the production DAG or applied to production.

PRODUCTION MUTATED: NO. No merge, deploy, migration, environment/activation change, real invitation/email, payment, commission, fulfillment or clinical action.

INHERITED FAILURES: cart-shelf-agreement.test.ts (2) and supplier-authority.test.ts (15), caused by wall-clock-dependent fixtures reading the expired founder supply seed. Live RAW_PEPTIDES_EXPIRES_AT remains 2026-09-03T23:30:00.000Z. Separate deterministic-fixture task follows the referral checkpoint.

BLOCKERS: No external credential or approval blocks the next two local follow-ups. Nine-width visual/mobile acceptance remains required after the PWA policy fix; task stays QA rather than done. Production activation requires separate exact-SHA authority and target-schema/flags review. Real provider email/OS-share behavior, full EA conversion lineage and whole-website completion are not attested. Existing Care static accepting/live copy conflicts with an unavailable status; later Care journey work must reconcile that independently, and this preview does not attest Care intake readiness.

NEXT EXACT CODE ACTION: Separately implement DETERMINISTIC-SUPPLIER-FIXTURE-MAINTENANCE-20260904 with fixed injected clocks and unchanged live expiry, commit/handoff it, then PWA-SENSITIVE-WORKFLOW-OVERLAY-POLICY-20260904; rebuild and run all nine required widths before accepting the referral task. Production remains untouched.

## Coordination and preserved work

The old AFFILIATE-PRODUCTION lease was reconciled as stale and released, not marked
complete. Its original worktree and unrelated dirty files were preserved in place;
no credentials/configuration were copied. Other live leases remain untouched.
The current local integration session owns only the recorded referral paths and
exact integration-test seams. No production-writer role was assumed.
