# Staff session assurance source handoff — activation deferred

Task: EA-STAFF-SESSION-ASSURANCE-20261118
Session: codex-ea-staff-mfa-20261118
Worktree: C:/xenios-wt/ea-staff-mfa-20261118
Branch: codex/ea-staff-mfa-20261118
Pushed source head: e635fdc5f1d95457cdf5dd04cde1c62e0264bd53
Source base: 169edddd932e6f32016b2c3af0f07e6aa5b1c086
Draft PR: https://github.com/teamxenios/xenios-website/pull/485
PR base: codex/ea-experience-root-integration-20261118

Root and independent reviewer notice_review explicitly deferred this entire draft from the public release. It is unmerged and must not be activated. No canonical helper or server authorization was modified. The existing staff/read path remains with Root's release candidate.

## Exact four-path source

- client/src/care/StaffSessionAssurance.tsx
- client/src/care/StaffSessionAssurance.test.tsx
- client/src/care/CareRequestIntentPage.tsx
- client/src/care/CareRequestIntentPage.test.tsx

The widget supports only a previously verified TOTP authenticator, checks the provider-verified current subject and ordinary canonical session, and counts only SDK currentLevel aal2. It has no enrollment/removal/grants/account setup. It never claims staff authority. Code is transient, cleared on operational failures, session changes, cancellation and success; detached code input nodes are explicitly wiped on lifecycle cleanup. Code variables clear immediately after SDK invocation. Safe fixed errors do not expose provider diagnostics. Keyboard focus follows the code field, errors and retries.

The page separates subject epochs from credential revisions: ordinary same-subject refresh preserves the readback child/drafts and recreates the canonical API object; sign-out/recovery/subject changes clear private child state. A late token/MFA rotation cannot establish a different subject or reopen a signed-out page. Server Care roles, capabilities, environment scope and AAL2 remain authoritative. The independently owned readback/timeline lane must refresh its current request wrapper when its API prop/current request changes; API identity alone currently refreshes the queue but does not reload an opened detail.

## Validation receipts and limits

- Source whitespace checks passed. Exactly the four paths above were committed; mirrored .xenios state was not committed.
- Pinned Node 20.19.0 pure SDK probe used actual installed GoTrueClient, fake fetch and memory storage only. It reproduced late verify persistence after completed local sign-out and after completed account switching. No provider call was made; these are synthetic SDK characterizations, not live provider qualification.
- Local two-file Vitest: NOT_RUN. The approved fresh memory guard exited at 309.75 MiB free, below Root's 700 MiB floor, before launching any runner. No owned test children remain. No subsequent local test/compiler/browser was started.
- Earlier head 042994e2b8192164e3663b12c361537d0a3b2a2e, hosted run 44238272533: StaffSessionAssurance 27/27 and CareRequestIntentPage 16/16 passed (43 owned tests). Full suite 19,343 passed / one failed / 83 skipped; 1085 files passed / one failed / six skipped. Only failure: server/research/commerce/persistence/persistent-cart.test.ts:325 expected invalid_input, received dependency_unavailable. Build/typecheck passed. Protection failed against the original incorrect main baseline; Root instructed the PR base correction. This older receipt is not final-head acceptance.
- Final head e635fdc5f1d95457cdf5dd04cde1c62e0264bd53, hosted run 44239011493: protection/build/typecheck passed. The test job stopped at the preceding customer-notice.pg.test.ts:91 qualification, duplicate workflow_notice_intents_request_id_revision_key. Owned suites and the new detached-input cleanup assertions are NOT_RUN at the final head. Required CI completion failed. No gates changed or failures blindly rerun.
- No live MFA/SMTP/provider qualification, enrollment, grants, configuration writes, managed database writes, deployment or production mutation occurred.

## Bounded follow-on contract

1. Keep this draft unmerged/default-off until an independently reviewed total-mediation contract is implemented in a separately leased canonical Auth lane. Do not weaken current AAL2, server roles/capabilities/scope or recovery fences.
2. Inventory every supported SDK writer and notification route: external password/OTP/OAuth/session/sign-out writers; initialize and implicit recovery; read-triggered and background token refresh; direct recovery storage removal; cross-tab storage/BroadcastChannel changes; persistence and scheduled Auth broadcasts. Bind an operation before internal _useSession and network work to the current session instance/transition generation, including a new login of the same subject.
3. Prove atomic ordering through fetch, deferred response-body parsing, SDK transforms, pre-save awaits, the actual storage commit and Auth broadcasts. Independent review found that fetch/body checks alone leave pre-save gaps; public locking excludes some writers; storage-only fences cannot veto already scheduled stale broadcasts. No narrow helper patch was accepted.
4. Preserve one canonical client/store. Never repair a stale result by silently revoking or overwriting a newer session. Use supported mediation or a separately reviewed SDK/upstream change; do not create a parallel Auth authority.
5. Extend real-installed-SDK synthetic tests to all boundary interleavings: sign-out, different-subject and same-subject new sign-in, recovery, refresh, cross-tab change, delayed body/commit/broadcast, and unmount. Prove stale results cause neither persistence nor notifications; preserve legitimate current-session verification. Existing raw SDK tests intentionally document the unresolved behavior.
6. Qualify the exact integrated head with focused/full hosted tests and independent review. Separately arrange an authorized person's normal provider sign-in and personal code entry for live acceptance. Agents must not perform real challenges or enter codes.

Root owns task ledger reconciliation, integration and publication. This handoff records source evidence only and grants no release approval.
