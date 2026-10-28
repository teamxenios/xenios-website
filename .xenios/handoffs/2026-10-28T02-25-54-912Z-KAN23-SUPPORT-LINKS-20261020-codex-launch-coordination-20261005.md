# KAN23 support-only release candidate — exact-SHA handoff (CI blocked)

Existing Root: 01a103a8-5684-7272-89e5-3c42eefcd593 / codex-launch-coordination-20261005.
Task: KAN23-SUPPORT-LINKS-20261020. Root lease: 5383ac8b-468d-4ae4-b45d-8c9117f4fa6b.
Samuel explicitly approved same-identity registration and one claim retry; both succeeded.
Original coordinator registration is unchanged. Supported custody commit: 851cbc1ef72004b882f740d1562077ee01d00e51.

PUSHED application candidate: 0b26406094073d6c3ab74ea397335b33a3a3e89a
Tree: 3f4a6d1685eecd72a354f6a22346f88da06d8268
Sole parent/release: 01aa375c48a2cbef1c582871df2718f7fac99013
Branch: codex/support-links-release-20261027
Draft PR: https://github.com/teamxenios/xenios-website/pull/330
CI: https://github.com/teamxenios/xenios-website/actions/runs/40619133348

Exactly eight approved application files: four components change eleven existing support hrefs; four existing tests add34 lines. Patch SHA2564533b9dabb462e6b98576d1350e1680c7f492d39ec9f742d8b4200befcfb2a42 was freshly checked/applied via Git --index. Candidate contains no .xenios or stacked application changes. Diff checks passed; source checkout was clean after commit.

## Actual execution

Existing GitHub-hosted CI, Ubuntu24.04.5 / Node20.20.2 / npm10.8.2. Unchanged Node20 workflow emits package's existing exact20.19.0 engine warning. No local X1 heavy test window or catalog DB01-16 qualification is inferred.

- Changed test files: OrderRequestEntry16, RequestIntentForm19, EarlyAccessRoute.storefront22, protected-composition.behavior4 =61 tests PASS in both full runs.
- Serial focused guest-entry phase:4 files/96 tests PASS in both attempts (45.72s then43.63s).
- Typecheck/build/protection PASS. Protection verified28 locked hashes; route uniqueness accepted454 registrations across445 call sites.
- Full attempt1:18197PASS/1FAIL/83SKIP (18281); files977PASS/1FAIL/6SKIP (984),280.74s. Failed server/release-control-plane.test.ts production-shaped PostgreSQL verifier: temporary Docker psql connection terminated by administrator/shutdown during bootstrap (lines1609/1659).
- Exactly one failed-job retry, same source, no code change. Full attempt2:18197PASS/1FAIL/83SKIP, files977PASS/1FAIL/6SKIP,238.48s. Failed server/research/products-diagnostics/variant-strength-write-gate-sql.test.ts: database system shutting down (lines546/611).
- Required CI completion FAILED on both attempts. No further retry. Candidate is NOT merge-ready.

Both unchanged fixtures poll default-socket "pg_isready -U postgres". Docker's upstream entrypoint starts a socket-only temporary server and stops it before final startup:
https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh#L264-L285
The two observed shutdown failures are consistent with that readiness race. This is a source-supported diagnosis, not a separately executed patched-harness proof or exact running-image source attestation.

Smallest proposed remedy: legitimate owner correct both fixture readiness probes to wait on TCP (pg_isready -h 127.0.0.1 -U postgres), preserving bounded timeout and every SQL/assertion/rollback, then qualify actual results. Both test files are outside Root's eight-path support lease. Existing Root KAN13 CI-routing task covers only checks.yml, so it does not grant those source edits. No harness/SQL/role/baseline/skip changes made.

## Continuity and limits

Preserved Core handoff: 81d6b93480ca8eaccbbf05a8c4793bf996da34d7, file .xenios/handoffs/2026-10-20T15-40-44-946Z-KAN23-SUPPORT-LINKS-20261020-codex-core-kan23-support-20261020.md. Its bytes and prior leases remain; custody history851cbc1 retains the original task pointer. The stacked branch is preserved, not merged into this candidate.

SAME Claude exact-head independent qualification remains pending; prior four-file source acceptance is not transferred to full CI acceptance. No new reviewer/worker/worktree, stopped-route resend, Core revival/Token8 change, local process/RAM census, acquisition, managed SQL, sends, merge or deployment. NO NEW RELEASE. Other catalog/notification/privacy/DB holds remain as recorded. Next operation is the specific two-file readiness harness repair through legitimate custody, then candidate qualification and existing release controls.
