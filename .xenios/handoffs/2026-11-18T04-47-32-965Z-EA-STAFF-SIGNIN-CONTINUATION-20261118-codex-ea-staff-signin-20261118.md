# Staff sign-in continuation handoff

Author: Codex staff_signin implementation agent, correlation EA-STAFF-SIGNIN-CONTINUATION-20261118.

- Worktree: C:/xenios-wt/ea-staff-sign-in-20261118
- Branch: codex/ea-staff-sign-in-20261118
- Base:169edddd932e6f32016b2c3af0f07e6aa5b1c086
- Commit:fe86b43102b2595fd31e87c2f1009ec4f2a51d5d
- Draft:https://github.com/teamxenios/xenios-website/pull/484
- CI:https://github.com/teamxenios/xenios-website/actions/runs/44235966449

Exactly three source paths committed:
1. client/src/research/pages/SignIn.tsx: seven runtime lines. Exact sanitized Care queue return only; fresh matching-principal/current-generation and recovery fences run first. Nonempty fresh bearer and submitted SDK subject are required. Navigation precedes customer-only member establishment. No new member/gate/role state, signOut or authorization.
2. client/src/research/pages/sign-in.test.tsx: fourteen new exact-target/fresh-token/current-principal/recovery/nonexact-target cases, including existing confirmed customer. All51 form tests pass.
3. client/src/research/pages/staff-sign-in-provider.test.tsx: five synthetic Auth/fetch cases using actual ResearchProvider + SignIn + actual Care page/canonical transport. Customer denial before and after handoff, stale success after unmount, recovery event during fresh-session await, and sign-in unmount all preserve existing boundaries. Synthetic Care403 uses the retained bearer; no role grant or actual live server access is claimed.

Hosted exact-head evidence:
- test/typecheck/build/protection/Required CI completion all pass.
- Full suite1086files/19324tests passed;6files/83tests skipped.
- Request workflow PostgreSQL gate1passed; focused guest-entry8files passed.
- Customer notice/staff recovery source not in169base, so those conditional gates are skipped here; Root must qualify them on composition.
- Narrow diff/whitespace check passed. No local heavy child started; RAM below700MiB and UX owned the heavy slot. No reinstall.

Independent native CLAUDE-3 review requested in KAN225comment13344; verdict pending. Root owns integration and release. Author touched no core/App/Care/reset/SQL/shared source or metadata. Root-mirrored .xenios modifications remain uncommitted in this worktree. No live sign-in, credentials, recovery mail, grant, Auth settings, deployment or MFA challenge was performed.

Remaining distinct proofs: native review, composed candidate checks, actual ordinary staff authentication/queue authorization/audit readback after user recovery, and any separately required MFA/AAL2 ceremony. This change alone is not a complete staff portal or full Early Access release.
