# Xenios UX continuation: auth/account implementation checkpoint

Classification: **LOCAL IMPLEMENTATION CHECKPOINT — NOT FULL UX COMPLETION OR DEPLOY APPROVAL**.

## Exact source and recovery

- Session/task: `codex-ux-continuation-20260904` / `UX-AUTH-ACCOUNT-CONTINUITY-20260904`.
- Worktree: `C:/Users/sboad/projects/xenios-ux-codex-20260904`.
- Branch: `codex/ux-continuation-20260904`.
- Base: `f318a85d6cd8d6b3cc5f6738656df6aaf37925ae`.
- Tested code: **`c93c48704c6842f6f65fdc0698cfb3fe627cad2e`**, pushed and origin-verified.
- First code checkpoint: `4bdeb241b2124e8cb718d90374e042d39c1fe8c8`. Review successor `7b420057a2b7c8f61b5c612c2ac19dcb6e202780` corrected check-in mode and account truth; the final tested code also preserves the existing `from=expired-session` hint found by full integration testing.
- The successor commit containing this handoff changes only records/evidence, not runtime source. Resolve that successor from the remote branch; do not invent a self-referential commit hash.
- Claude session `d067e872-0c2b-4637-ab02-bcaf9afdd4ba` hit its usage limit at 2026-09-04 14:56:09 UTC (09:56 Chicago), before making UX code changes. Its previous Care domain-integrity work is retained unchanged.
- Original worktree `C:/Users/sboad/projects/xenios-ux-foundation-20260904` was left untouched. Dirty metadata and its patch are backed up in `C:/Users/sboad/projects/xenios-ux-claude-recovery-20260904`.

## Implemented and bounded

1. One shared closed destination policy now supports sign-in, reset requests and server-generated recovery redirects. It checks raw paths before URL normalization, projects only bounded non-secret query values, and uses the configured site origin, not the request Host.
2. Safe destinations survive sign-in -> reset request -> synthetic email arrival -> password reset -> mandatory fresh password sign-in. Account/order references retain case; storefront variant/quantity/intent and the assessment's exact monthly-check-in mode survive. Activation and billing gates still outrank navigation hints.
3. Claim success and account-security password recovery retain safe context. Sign-in has a reversible keyboard-operable Show/Hide control, a 44px target and 16px inputs.
4. Account attention now has a server-derived closed destination to the existing Care, membership, order or support surface. A request is not an unpaid order. Unknown/exceptional record facts produce an indeterminate account, not an unsupported payment demand or green all-clear.
5. The 15-persona Markdown/JSON journey matrix records actual source boundaries and unfinished journeys. The canonical Gen 2 referral implementation plan identifies the next code seams without claiming the unmounted referral flow works.

This does not open membership applications, mount parked organization invitations, invent XRR list-by-member history, link a Care request to a patient, or grant any entitlement. Free-text search/product-name hints, raw referral codes and credentials are intentionally not put into recovery URLs. Complete form-draft persistence is a separate design task.

## Verification of the tested code

Toolchain: Node 20.19.0 / npm 10.8.2.

| Check | Result and boundary |
| --- | --- |
| Focused auth/account checks | 8 files, 293 tests PASS. Includes trusted-origin recovery, claim scrub, storefront intent, check-in mode, expired-session context, account truth and closed action targets. |
| Independent review recheck | 3 files, 98 tests PASS on the exact final code, confirming the narrowly bounded expired-session fix. Earlier account/check-in review passed 136 tests on 7b42005; those runtime changes are retained. |
| TypeScript | `npm run check` PASS. |
| Production build | `npm run build` PASS; retained existing dynamic/static-import and large-chunk warnings. |
| Route uniqueness | PASS: 414 static API registrations across 405 call sites. No API route added or duplicated. |
| Added-line secret scan | PASS: 0 findings over 2,784 added lines / 31 files from the recovery base to tested code. No scanner rule weakened. |
| Name-list PII scan | NOT RUN: no out-of-repository names list supplied. Do not report a non-skipped PII scan or full release certification. |
| Recovery/core-site/release-control gate | Final c93c487 full run: all 5 files PASS, 170 tests passed, 1 skipped. Preview-harness safety also passed its 3 tests. |
| Full regression suite | **NOT GREEN**: 820 files passed, 2 failed; 12,335 tests passed, 17 failed, 43 skipped. Only the inherited supplier/catalogue files failed; the auth regression is corrected. |

The earlier full-suite attempt on `4bdeb24` was interrupted when review required source changes. It is excluded from acceptance evidence; its process exit is not a regression result.

The completed 7b42005 integration run was **not green**: 819 passed files / 3 failed files, 12,333 passed tests / 18 failed / 43 skipped. One newly exposed failure was the existing persona deep-link test expecting `from=expired-session`; c93c487 fixes it without weakening the test. The other 17 failures were the two inherited supplier/catalogue files. The predecessor preview-harness failure did not recur. Do not mistake identical failure counts for identical failures.

Final regression evidence is committed at `docs/ux/auth-account-20260904/full-suite-summary.json`. Raw c93c487 report: `C:/Users/sboad/projects/xenios-ux-claude-recovery-20260904/full-suite-c93c487.json`, SHA-256 `1735c541bdb9ef530265a0fe9e4f52a244df70828f9a17c5a2d9b00d26aa51f4`. Exit code 1 was retained, not hidden by a wrapper. `cart-shelf-agreement.test.ts` (2) and `supplier-authority.test.ts` (15) are unchanged, as is their supplier seed expiring at 2026-09-03T23:30:00Z; these tests use the current clock. Neither live supplier facts nor the clock were altered to manufacture a pass. Separate deterministic-fixture maintenance must preserve expiry-negative coverage and must not imply current production availability.

### Actual-bundle browser evidence

The fresh-profile run used the existing synthetic account preview, the actual production client bundle and the repository's strict CDP network boundary. Source SHA and bundle-index SHA were identical at start and finish.

- Widths: **1440, 1366, 1024, 768, 430, 390, 375, 360, 320**, all PASS for the exercised journeys.
- Four surfaces per width: sign-in, reset, overview and security; 36 screenshots retained locally.
- Exact safe account return links (including `from=expired-session`), synthetic password sign-in destination, keyboard Show/Hide, no horizontal overflow, truthful unavailable/no-action account state, and security reset destination verified.
- 670 observed browser requests, all localhost; 0 external HTTP requests, boundary violations, runtime exceptions or attempted server outbound connections. No provider credentials inherited.
- Bundle-index SHA-256: `28490a091ee22a08009a908b7d12425ddc9361ce316f9b2bca0d9e4d2cdf5154`.
- Committed structured evidence: `docs/ux/auth-account-20260904/browser-results.json`.
- Committed representative screenshots: `signin-320.png`, `signin-1440.png`, `reset-320.png`, `security-320.png`, `overview-1440.png` in the same directory. Root visually inspected the 320px sign-in/reset/security and desktop overview.
- Complete local artifacts and task-owned reproduction harness: `C:/Users/sboad/projects/xenios-ux-claude-recovery-20260904/browser-qa-results-c93c487-post-suite/` and `browser-qa.mjs`. Preview processes were stopped.

Limits: this did not send or receive a real recovery email. The synthetic account has requests, not unpaid orders, so actionable branches are unit-test evidence, not browser evidence. Earlier shared-profile runs hit a font/network-idle telemetry stall. Some c93c487 attempts during the full suite also failed screenshot-layout or pending-request guards; those diagnostics are preserved, not counted as passes. The final run occurred after the full suite exited, with direct fresh profiles, bounded font/geometry settling and a 30-second settle deadline; the 800ms quiet-through-paint, dimensions and network-boundary assertions remained intact. No PWA warm-up or service-worker disablement was used, and no performance/latency claim is made. Existing PWA promotion overlays can cover lower copy/navigation, including security-page copy. That P2 remains open; this is not blanket visual/accessibility certification.

## Production and privacy boundary

Read-only Render monitoring confirmed live `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, deployment `dep-dad08h740ujc73aprfcg`, service `srv-d8s9vej7uimc7384dfcg`, with auto-deploy disabled. The Render monitoring skill kept verification read-only. This branch was not merged into the release branch.

No deploy, migration, production environment change, customer email, invitation, real link issuance, patient action, payment/fulfillment fact or supplier evidence mutation occurred. No migration is introduced by this auth/account slice.

Before a release, verify the current Supabase reset-email template and redirect configuration accept the exact recovery URL with its encoded safe returnTo. The provider requires redirect configuration to match the requested URL and template handling can affect the destination; neither live setting was attested here. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls) and [redirect troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-am-i-being-redirected-to-the-wrong-url-when-using-auth-redirectto-option-_vqIeO). Do not silently change production settings or send a real test email. Obtain current authority for any required mutation.

## Remaining program and next exact work

The full UX/referral parent remains **incomplete**. This handoff does not complete all 14 experience waves.

1. Resume with `AGENTS.md`, the continuity corpus and this exact-source handoff; run `node scripts/agentic/xenios-os.mjs validate` and inspect task/lease state.
2. Next priority: canonical Gen 2 referral link validity and member-owned link management, then safe recipient capture and durable first-valid binding. Follow `FULL_UX_FOUNDATION_REFERRAL_NEXT_SLICE_2026-09-04.md`. Reconcile the legacy affiliate lease before writing it; do not silently seize another writer's paths. Local engineering is unblocked by provider integration or GitHub Actions billing.
3. Separate narrow P2: `client/src/pwa/PwaLifecycle.tsx` globally overlays sensitive workflows. Add a route-aware promotion visibility policy with SPA-transition tests; handle update notices independently and retain explicit refresh consent. Do not alter registration/service-worker privacy rules to solve layout.
4. Continue the matrix's unimplemented account-first/invitation, request-history, Care continuity and persona journeys in their own owned slices. Never replace missing authority with optimistic UI.

Founder action: none for ordinary local engineering. A later deployment/configuration/migration or real-message action requires a new action-specific exact-SHA approval and release gates. Old GO hashes are not authority for this candidate.
