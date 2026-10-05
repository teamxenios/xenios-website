# Public partner sign-in return path, 2026-10-05

Status: source-only correction, focused local tests PASS; independent review and release qualification still required. No production or staging mutation. Stop at this handoff.

## Exact identity and scope

- Existing Core session: `codex-xenios-health-launch-implementation-20260930`, continued without re-registration.
- Isolated successor branch: `codex/xenios-partner-signin-return-20261005`.
- Worktree reused clean: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
- Frozen base records: `b0e818f0b3908b13c4181c5b6a59751c1505694b`, tree `e56e6406354ee8cc9dd1c600563df58409afdc34`.
- New runtime source: `94e89be7c959087edfde4ebddf2f50fa5e02cc36`.
- New runtime source tree: `23b3284a5cfc667b5cdc0e35643f07e71c333268`.
- Test-only commit: `806c58a83bb3c0f1f75b9e003de14aa525069950`.
- Clean tested checkout: `3315efe1b5cbb8a286d31e41d38fd2786f4fe279`, tree `64c927f17b7cc1de285e4cbfe744c5cb2b4479bf` (continuity-only successor).
- No new release-control change. Later evidence/records commits are not new runtime candidates.
- Authority: Samuel's direct 2026-10-05 instruction in coordinator chat `01a103a8-5684-7272-89e5-3c42eefcd593` explicitly authorizes the cross-chat workflow and gym-owner/customer launch preparation. Main read that user message independently before following the coordinator's bounded two-link delegation. D/E was told to leave this file alone.

The IC-2 source `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0` and its original branch/records remain frozen. `git ls-remote` still returned `b0e818f0b3908b13c4181c5b6a59751c1505694b` for `codex/xenios-health-launch-implementation-20260930` while this separate slice was packaged. No IC-2 evidence was amended or relabeled.

## Reproduced defect and exact change

Both main-content Sign In links on `/partners` were plain `/sign-in`. Existing canonical sign-in therefore defaulted active customer accounts to `/research/account`, losing the intended partner workspace. Both links now use:

```text
/sign-in?returnTo=%2Fresearch%2Fpartners%2Fdashboard
```

Runtime classification: **only two href replacements in `client/src/clarity/pages.tsx`**, within `PartnersPage`. A byte comparison proves that replacing those two new URLs with `/sign-in` restores the frozen file exactly. No copy, public inquiry, activation, global header/footer, CSS, route registration, auth policy, server, schema, product or financial change.

The existing returnTo allowlist already permits `/research/partners/dashboard`. Public `/sign-in` already mounts `SignInAuthorityPage`, the existing Research provider and canonical SignIn. A successfully verified active customer can navigate to that destination; the actual dashboard then independently requests the authenticated owner's partner data. Ordinary customer access does not become partner access. Admin routing, inactive/denied accounts and recovery isolation retain their existing behavior.

No helper, identity system, grant, membership fee, organization UI, affiliate approval or commerce entitlement was introduced. The public partner inquiry remains an inquiry, not an application/account/approval.

## Focused verification and raw evidence

Node **v20.19.0**, npm **10.8.2**, invoked through the isolated full-path runtime. The existing wrapper pins child PATH only for the process and enables the real dataset reader. Dependencies were reused, not reinstalled. Each run has one process sample; the green snapshot shows the wrapper, test process and descendant at the pinned executable. Sampling is not continuous proof of every worker.

New `client/src/clarity/partner-sign-in.test.tsx` has 13 composed cases using the actual PartnersPage, public SignInAuthorityPage, ResearchProvider, routing, Dashboard and partner adapter. Only Auth and HTTP transports are synthetic. It verifies both actual links, forgot-password return continuity, owner-bound bearer reads, ordinary customer partner denial, missing Auth session, recovery marker/token, server account denials, hostile external/admin/unrelated-partner paths, unchanged global sign-in links and unchanged inquiry guidance. All simulated HTTP is allowlisted GET-only; no inquiry is submitted.

| Run | Result | Revision and limits | Duration |
| --- | --- | --- | --- |
| `partner-signin-red-run1` | 9 PASS / 4 FAIL, exit 1 | Frozen `b0e818f` runtime, dirty new test and continuity. Also had a missing `/api/config` fixture assertion; retained as an initial diagnostic, not clean reproduction. | 12.511 s wrapper / 10.65 s Vitest |
| `partner-signin-red-run2` | 9 PASS / 4 FAIL, exit 1 | Same unchanged runtime, corrected config fixture. Four destination assertions reproduce plain links, lost recovery return and wrong account destination. | 18.043 s wrapper / 13.68 s Vitest |
| `partner-signin-green-run1` | **205 PASS / 0 FAIL / 0 SKIP**, 7 files, exit 0 | Clean `3315efe` at start and end. 2026-10-05 17:14:56.808 to 17:15:35.153 UTC. | 38.345 s wrapper / 36.95 s Vitest |

Exact commands (use fresh job names to avoid overwriting evidence):

```powershell
& 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe' 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs' partner-signin-red-run1 node_modules/vitest/vitest.mjs run client/src/clarity/partner-sign-in.test.tsx --maxWorkers=1 --no-file-parallelism
& 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe' 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs' partner-signin-red-run2 node_modules/vitest/vitest.mjs run client/src/clarity/partner-sign-in.test.tsx --maxWorkers=1 --no-file-parallelism
& 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe' 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs' partner-signin-green-run1 node_modules/vitest/vitest.mjs run client/src/clarity/partner-sign-in.test.tsx client/src/research/pages/sign-in.test.tsx shared/research/auth-return-to.test.ts client/src/research/pages/partners/Dashboard.test.tsx server/research/partner-access-wall.test.ts server/research/partners/own-reads.test.ts client/src/research/core-member-denial.test.tsx --maxWorkers=1 --no-file-parallelism
```

The red runs require the respective test fixture on frozen source, not the corrected source. Existing member/partner/allowlist/denial tests run unchanged. `git diff --check` and continuity validation PASS. A separate read-only agent found no actionable delta/test-scope discrepancy; that is not independent Claude acceptance.

Complete logs, hashes, revision/dirty-state receipts, process samples and invariants are in [raw-checks-and-invariants.json](evidence/partner-signin-return-20261005/raw-checks-and-invariants.json), SHA-256 `799907999efe82155ae1f38476ced3b633d2dda0a6c0df51cd3786463eaa1c0e`.

Log SHA-256: red1 `5fccf237e7eed82407123d7a957f49d0875309c2ba21f41d92dba830c0a06db4`; red2 `57fec3abe7667de3cd4f349d88812828e546195ceb03fac7fa2df07637e98550`; green `45c0362a22e59a6ee66af94ab290296322534e427467755a37f950affed8d034`.

## Invariants, limitations and review handoff

- The evidence compares frozen source, successor and working bytes for Navbar, Footer, index.css, protection manifest, IC-2 stylesheet, App, Research section, SignIn, AccountAuthorityPages, shared returnTo policy, Research provider and Dashboard. All are unchanged. Every other runtime path also remains unchanged by Git diff.
- Supabase skill prompted a changelog/security check and retention of canonical session/return authority. The [current redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls) was consulted; this application-local navigation hint changes no Supabase redirect configuration, callback, provider API or authorization. No database operation was needed or performed.
- The composed tests use a focused route harness, not full App mount or real Chrome. Auth SDK responses, JWT-purpose classification and server HTTP outcomes are synthetic. Separate unchanged server tests exercise existing wiring/ownership with injected dependencies, not managed Auth/RLS. No live-account, browser, native zoom, subscription purchase or payment verification is claimed.
- No typecheck, build, no-em-dash build scan, full suite or Docker job was run for two href literals. No copy or shared contract changed. Old aggregate failures stay separate and unresolved for release qualification.
- No merge, protected-manifest recut, migration, deployment, hosted setting, grant, price release, real email, notification, money or procurement action. Earlier production observations were not refreshed or represented as new evidence.
- This repairs an existing approved partner's navigation. It does not approve the gym owner, establish referral eligibility, enable subscriptions or certify today's customer purchase path. Those require separate canonical evidence and exact release decisions. Existing protection, GATE-01, finance and managed-qualification holds remain.
- Next: existing independent reviewer checks exact `94e89be7`/`23b3284a` two-link delta, 13 composed cases and unchanged auth/partner authority. Source commit is cherry-pickable separately from tests and continuity. Preserve the separate IC-2 review; do not infer acceptance or deployment approval for this slice.

Core stops after the pushed records-only checkpoint. Coordinator owns further release coordination.
