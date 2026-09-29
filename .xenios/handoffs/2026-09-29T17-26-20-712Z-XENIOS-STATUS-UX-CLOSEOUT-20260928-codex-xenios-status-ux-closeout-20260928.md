# Xenios P-17 verification reconciliation and managed-staging preflight

Date: 2026-09-29

## Disposition

The website runtime remains frozen and unchanged:

- Runtime SHA: `c213707a9d80ecc9f772b5790acb52f1fa503da7`
- Runtime tree: `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`
- Runtime change in this reconciliation: **none**
- Tests rerun in this reconciliation: **none**
- Staging mutation: **none**
- Production mutation: **none**
- Migration applied: **no**
- Hosted configuration changed: **no**
- Email sent: **no**

The candidate remains ready for a separately authorized managed-staging qualification. A fresh read-only check found the required assisted-order bridge absent from the existing staging project, so execution also needs an explicit predecessor installation plan and authorization. The exact hosted non-production application origin/service and named executor are still missing.

## Separate verification runs

The two reports are preserved as separate runs. Their outcomes must not be combined.

| Run | Report commit | Execution identity | Runtime under review | Node/npm | Aggregate result | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Codex clean aggregate | `3a7c15a402060519e6465938bffa76fb9c01acc8` records the run | Test execution at pushed validation revision `796f0ba55c9d665086ee11904a691b7f313e3223`; report added later at `3a7c15a...` | `c213707a9d80ecc9f772b5790acb52f1fa503da7`, tree `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0` | private Node `v20.19.0`, bundled npm `10.8.2` | 987 files passed, 6 skipped; 18,182 tests passed, 85 skipped; zero failed; exit 0 | Clean aggregate evidence |
| Claude independent run | `91a3e6756410aa2f289fbd2d2523eeec9567cb5a` | Independent worktree `C:/xenios-wt/closeout-review` at `796f0ba...`, local branch `claude/final-verify-796f0ba`; the report was later committed on a different Claude documentation branch | exact frozen runtime reviewed independently | Node `v20.19.0`; global npm `11.11.0` on Node 20 because bundled npm `10.8.2` exited 1 without a diagnostic on that host | 986 files passed, 6 skipped, 1 timed out; 18,181 tests passed, 85 skipped, 1 timed out; isolated affected files then passed 57 with 1 skipped | Retained as a timeout run, not relabeled as clean |

Both reports conclude P0 0, P1 0, P2 0. The timeout in the Claude run was `release-control-plane.test.ts` under its fixed 30-second limit during parallel load. Its isolated rerun passed, but that does not rewrite the aggregate run's outcome.

## Clean 18,182-pass evidence

The supporting existing session log is outside Git at:

`C:\Users\sboad\.codex\sessions\2026\09\26\rollout-2026-09-26T21-01-08-01a0e098-3b23-7233-9b07-877ace092650.jsonl`

Relevant log records:

- Ordinal `16508`: launches the authoritative command.
- Ordinal `16820`: final Vitest summary, including 987 passed files and 18,182 passed tests.
- Ordinal `16821`: command-completion record, process `40920`, status `completed`, exit code `0`, plus the full captured stdout beginning with the resolved Node path.
- Ordinal `16862`: post-run identity and release-control output confirms `HEAD=796f0ba55c9d665086ee11904a691b7f313e3223`, frozen runtime tree `09cbd1d...`, and the official archive checksum.

Exact command:

```powershell
$runtime='C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64'
$env:Path="$runtime;$env:Path"
$npm=Join-Path $runtime 'npm.cmd'
Write-Output "NODE_RESOLVED=$((Get-Command node).Source)"
node --version
& $npm test -- --reporter=dot --testTimeout=120000 --no-file-parallelism --maxWorkers=1
```

Recorded provenance:

- Resolved executable: `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe`
- Node: `v20.19.0`
- npm: `10.8.2`
- Official Windows x64 archive SHA-256: `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`
- Test execution revision: `796f0ba55c9d665086ee11904a691b7f313e3223`
- Frozen application runtime: `c213707a9d80ecc9f772b5790acb52f1fa503da7`
- Frozen runtime tree: `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`
- Result: exit `0`; 987 passed files, 6 skipped; 18,182 passed tests, 85 skipped; duration 1525.01 seconds.

Child-worker provenance is strong inheritance-chain evidence, not a per-worker executable capture. The process-local `PATH` was prepended before invoking the private runtime's `npm.cmd`; `Get-Command node` resolved the private Node 20 binary; npm and Vitest workers inherit that environment. An earlier preliminary run was explicitly stopped after discovering that invoking only `npm.cmd` could leave child processes resolving the system Node. That preliminary run is invalid and is not counted. No per-worker PID-to-executable inventory was captured during the clean run, so this handoff does not claim one.

## P3 finding reconciliation

The twelve original findings are from `81aee4845f4a941a5d6db933a56aa3cb099bd7d8`. The six new observations in `91a3e675...` did not have IDs; this reconciliation assigns `R-16` through `R-21` so all eighteen remain traceable. Assignment of these IDs is administrative and does not imply they existed in the original report under those names.

| ID | Finding | Current status | Evidence/disposition |
| --- | --- | --- | --- |
| R-04 | 75 ms response floor may not cover managed match-path p99 | Open, staging-measurable | Measure matched and unmatched distributions on managed staging without exposing result distinctions. Do not infer from local timing. |
| R-05 | Retried email says 30 minutes although token expiry is fixed at first send | Open | Copy/token lifetime mismatch remains. |
| R-06 | Same five-minute idempotency bucket may produce no new message after first link was consumed | Open | Preserve as a retry-UX limitation; qualification must exercise it. |
| R-07 | Timeline uses raw/unaligned status labels | Open | Frozen source still renders `item.status.replaceAll("_", " ")`; `payment_pending` copy remains `Payment pending`. |
| R-08 | Failed exchange focus fell to `BODY` | Resolved in frozen runtime | Frozen source focuses the exchange error alert (`tabIndex=-1`) after returning to request phase; independent report observed replay/expired alert focus. |
| R-09 | Staging can fall back to production `SITE_URL`, development signing key behavior, and non-secure cookie mode | Open, mandatory precondition | Qualification must assert `NODE_ENV=production`, exact non-production `SITE_URL`, and a unique staging-only `RESEARCH_SESSION_SECRET` before any request. |
| R-10 | `ON DELETE RESTRICT` can block assisted-order deletion after recovery history exists | Open | Retention/erasure procedure remains unresolved. Cleanup must delete only run-owned recovery rows in dependency order and must never delete retained customer data. |
| R-11 | Inquiry error fallback loads the full LOI table | Open | Unrelated performance/PII hardening remains deferred. |
| R-12 | Sign-in configuration outage can trigger a retry storm | Open | Unrelated resilience hardening remains deferred. |
| R-13 | Two partner leads still say `eligible orders` instead of the approved `eligible research-product orders` | Open | Present in `client/src/clarity/pages.tsx` and `client/src/research/b2b/PartnerPathwaysPage.tsx`; not changed in this evidence-only task. |
| R-14 | Disposable SQL bootstrap was not checked in | Closed: original observation disproved | The M71 role/authority bootstrap is `supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql`; the P-17 behavior verifier is `supabase/verification/20260927_research_status_recovery_disposable.sql`. Both files existed at the original review commit `81aee484...` (`git cat-file -e` succeeds). Managed parity remains unrun. |
| R-15 | Function `search_path` lacks an explicit trailing `pg_temp` | Open | Five functions remain `set search_path = pg_catalog, public`; prior review found no exploit in tested conditions. Migration stays frozen. |
| R-16 | Native zoom screenshots are not committed | Open, evidence durability | Images remain inline in the Codex session log; save attempts failed. Numeric/browser evidence is committed, but image files are not. |
| R-17 | Ending secure status access returns focus to `BODY` | Open | Accessibility polish remains deferred. |
| R-18 | Runtime-config no-em-dash gate input list is hand-maintained; DB-fed operator strings are outside static scope | Open | Release-control coverage risk remains visible. |
| R-19 | `site:record:check` is CRLF-sensitive and branch-name-bound on Windows | Open | Tooling issue; canonical Git blobs matched after controlled regeneration. |
| R-20 | Fixed 30-second test limits flake under host load | Open | This caused the separate Claude aggregate timeout; isolated rerun passed. |
| R-21 | Bundled npm 10.8.2 exits silently on the Claude host | Open | Host-tooling issue; Codex clean run used the same bundled npm successfully. |

Totals after ID-level reconciliation: 18 P3 IDs, 1 resolved by the frozen runtime (`R-08`), 1 closed because the original observation was disproved (`R-14`), and 16 open/deferred. None is promoted to P0, P1, or P2 by the two verification reports.

## Zoom evidence classes and screenshot index

Evidence types remain distinct:

1. **Native Chrome page zoom run by Codex**: true browser zoom, not emulation.
2. **Reviewed Codex evidence in the Claude report**: Claude accepted the exact-candidate numeric/browser evidence but did not independently operate native 400 percent zoom.
3. **Claude viewport proxy**: a 320 by 152 CSS viewport with keyboard checks. It is supplementary reflow evidence and is not true zoom.

The native evidence is in the same session log listed above. Inline images are embedded in the JSONL; no standalone screenshot file was successfully saved or committed. Because the log is local and appendable, its image evidence is less durable than committed artifacts; `R-16` stays open.

| Zoom/evidence | Session ordinal | Tool call | What it contains |
| --- | --- | --- | --- |
| Native 200 percent baseline | `15173`/output `15174` | `call_9p59H1IICKuWEHGgqKiJktCN` | Inline screenshot and metrics: DPR 3, client width 632, no clipped controls. |
| Native 200 percent focus trail | `15189`/output `15190` | `call_iZUwzLqUu13p0sQbcDRojNQL` | Inline screenshot with keyboard traversal evidence. |
| Native 200 percent focused submit | `15196`/output `15197` | `call_B1u3HNnMugM8X17zLnybplbs` | Inline screenshot and focused-control geometry. |
| Native 400 percent baseline | `15229`/output `15230` | `call_zKWD6dhYMjvY6r9YMKo4ZvRg` | Inline screenshot and metrics: DPR 6, inner 320 by 152, client/scroll width 316/316, horizontal overflow 0. |
| Native 400 percent top/focus audit | `15236` | `call_NdQgsGPThuDIVF9GpblxLV7d` | Inline screenshot at page top plus focus geometry. |
| Native 400 percent repaired reverse-focus proof | `15558` | `call_sdv2AsAh3VuI62psFVKsyVpj` | Inline screenshot showing the repaired focused control fully visible below the sticky header. |
| Final native 200 percent repaired run | `15670`/output `15671` | `call_uZm11XL508GjZ9Bv0aSlW0bM` | Inline screenshot, final metrics, client/scroll width 632/632, overflow 0. |
| Final native 200 percent top page | `15677`/output `15678` | `call_RqUgpeStnBeyryo5s4pRxi7l` | Inline top-page screenshot. |
| Final native 200 percent focus audit | `15684`/output `15685` | `call_YWuJUE4R6hSwwPyxOLR2s325` | Inline screenshot with forward/reverse focus trail. |

At ordinals `15941`/`15943`, the in-memory final screenshot byte counts were 10,748 bytes at 200 percent and 5,785 bytes at 400 percent. Attempts to download them at ordinals `15949` and `15956` failed; this is why `R-16` remains open. The report at `3a7c15a...` classifies 200 percent as independently inspected native zoom and 400 percent as reviewed Codex evidence. The report at `91a3e675...` says its own true-zoom run was not performed and labels its 320 by 152 run a viewport proxy.

## Managed-staging target and positive production distinction

Repository evidence and fresh read-only connector checks on 2026-09-29 identify:

| Role | Project | API/database origin | Status of identity evidence |
| --- | --- | --- | --- |
| Non-production target | `xenios-research-staging`, project ref `tetynodzrtmdbuzgboro`, organization `ifthgtkazldsfuybihfy`, region `us-west-2` | `https://tetynodzrtmdbuzgboro.supabase.co`; DB host `db.tetynodzrtmdbuzgboro.supabase.co` | Fresh connector read: `ACTIVE_HEALTHY`, managed database version `17.6.1.147`; SQL `server_version=17.6`. Re-read immediately before any future write. |
| Production, forbidden | project ref `yvzeduaxbwgcwllhywff`, region `us-east-2` | `https://yvzeduaxbwgcwllhywff.supabase.co`; production web origins include `https://xeniostechnology.com` and `https://xenios-website.onrender.com` | Fresh connector read: distinct `ACTIVE_HEALTHY` project and DB host `db.yvzeduaxbwgcwllhywff.supabase.co`. Negatively assert before every future write. |

No exact hosted **application** staging origin or Render staging service ID is recorded for this P-17 run. A read-only Render service inventory was attempted, but the connector requires a user-confirmed Render workspace before listing services; no workspace was selected. The Supabase staging API origin is not a substitute for the application `SITE_URL`. Qualification must stop until a named HTTPS application origin and its non-production service identity are supplied and positively checked as not equal to either production web origin.

The latest Supabase changelog reviewed on 2026-09-29 announces a PostgreSQL 17.11 rollout from 17.6. The fresh project read still reports 17.6.1.147. Preflight must re-record `server_version`, installed `pgcrypto`, and any applicable upgrade state immediately before apply. Official references:

- <https://supabase.com/changelog?types=breaking-change>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/api/securing-your-api>
- <https://supabase.com/docs/guides/deployment/database-migrations>

## Exact migration identity and intended history

Authoritative source:

- Path: `supabase/migrations/20260927203000_research_status_recovery.sql`
- Candidate copy: `supabase/candidates/20260927203000_research_status_recovery.sql`
- Source commit pinned in the DAG: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
- Canonical Git blob: `1bc153c1f32e7806fd30d33ebc67ce25ec61e40e`
- Canonical LF byte length: `16,759`
- Canonical LF SHA-256: `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`
- Candidate/migration canonical blobs: byte-identical
- Intended migration-history version: `20260927203000`
- Intended history name: `research_status_recovery`
- DAG dependency: `research_assisted_order_bridge`
- Dependency canonical path: `supabase/migrations/20260815150000_research_assisted_order_bridge.sql`
- Dependency canonical Git blob: `edd6060e81cc891f84724e30a9f70f1fab65af3c`
- Dependency canonical LF byte length: `48,280`
- Dependency canonical LF SHA-256: `3e59df2650dedb1d13dbe604c57ae35c0de9e28409c06cd41332b8ae9020d8d7`
- Dependency managed history ID recorded for production: `20260819203614`.
- Current DAG state: P-17 pending; not applied to staging or production.

### Fresh read-only staging prerequisite result: FAIL

On 2026-09-29, the connected Supabase project inventory confirmed `tetynodzrtmdbuzgboro` is healthy. `list_migrations` returned twelve entries (from version `20260908164502` through `20260923172539`), none named `research_assisted_order_bridge` and none at version `20260927203000`. A read-only SQL query returned:

```text
server_version=17.6
research_assisted_order_requests=NULL
research_assisted_order_events=NULL
research_status_recovery_tokens=NULL
research_status_recovery_sessions=NULL
research_status_recovery_* function count=0
```

Thus P-17's checked-in precheck would return `STOP_MISSING_ASSISTED_ORDER_REQUESTS`. Its migration preflight would also raise before creating either recovery table. A P-17-only authorization for this existing staging project is insufficient. The predecessor M71 bridge must be independently reviewed and explicitly authorized for installation first, or a different exact non-production project with a proved equivalent bridge must be selected in a new plan. No bridge or P-17 write was performed during this check.

Windows checkout warning: the worktree currently materializes CRLF bytes (17,164 bytes; SHA-256 `c7892b364c4268e4d4c182ab8ed11d5a37f81cbb5dd74d7500e64ab13bbfc7fc`). That is semantically the same text but is not the authorized canonical byte stream. The future executor must extract the Git blob byte-for-byte, verify 16,759 bytes and the `98cce457...` checksum, and apply only that artifact. Do not run an unbounded `supabase db push`, do not repair migration history, and do not apply intervening pending migrations as a side effect.

Associated controls:

| Artifact | Checkout bytes | Checkout SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `supabase/candidates/20260927203000_research_status_recovery.precheck.sql` | 899 | `dc35c36f6b7ed8777648a61230d667c92f0c119cda3b6708cb236707432d0b08` | Read-only prerequisite/object inventory |
| `supabase/candidates/20260927203000_research_status_recovery.postcheck.sql` | 2,231 | `da7a03f651e38d1c0fcede9f99f11ec9112fd27ae510f9c8df85d27470d41755` | RLS, ACL, owner, function body and row-count evidence |
| `supabase/verification/20260927_research_status_recovery_disposable.sql` | 6,732 | `ffd31d31a790f627731c3815f4451487e5a5c68432dd5044f4674f9de65da91c` | Synthetic behavior verifier; adapt only by reviewed run-owned fixture bindings, never customer data |
| `supabase/candidates/20260927203000_research_status_recovery.rollback.md` | repository-controlled | repository-controlled | Preserve-first rollback procedure; not automatic cleanup authority |

## Managed-staging execution plan

This is a plan, not authorization and not an execution receipt.

### 1. Stop-before-write identity gate

The named executor must capture a fresh read-only receipt that proves all of the following in one run:

1. Supabase project ref is exactly `tetynodzrtmdbuzgboro`, name is `xenios-research-staging`, and project status is writable/healthy.
2. Project ref, API origin, database host, organization/service identity, and application origin do not equal production ref `yvzeduaxbwgcwllhywff` or either production web origin.
3. Current PostgreSQL server version, `pgcrypto` version, executor role, `rolsuper`, `rolbypassrls`, and transaction-local `row_security` are recorded.
4. No second writer is active.
5. Exact hosted staging service ID and HTTPS origin are recorded. `SITE_URL` equals that origin exactly and does not fall back to production.
6. `NODE_ENV=production`; cookies are therefore `Secure`; a new staging-only `RESEARCH_SESSION_SECRET` is present, sufficiently random, and not equal to development or production secrets. Record only presence/fingerprint metadata, never the secret.
7. Real delivery credentials are absent/disabled. No Resend, SMTP, webhook, queue consumer, cron, or external notification worker can deliver. A synthetic in-process/outbox capture is the only sink.
8. Current migration history is exported. `20260927203000` is absent with no conflicting version/name. For the existing target, the current known absence of the M71 assisted-order bridge is a hard stop. The predecessor must be installed under its own exact authorization and verified in history and schema before P-17 can be considered. The two recovery tables plus five functions remain absent unless a future read proves an explained, byte-matching prior installation.
9. Baseline counts and IDs for assisted-order fixtures, recovery tables, and notification outbox are recorded without customer PII. Existing retained staging rows are never reused.

Any identity mismatch, missing prerequisite, unexpected existing object, active delivery path, migration-history divergence, cost/restore prompt, or production-like configuration is a hard stop before writes. The current missing prerequisite is already known; do not proceed with a P-17-only apply on `tetynodzrtmdbuzgboro`.

### 1A. Predecessor gate for the existing staging project

1. Independently review the exact M71 bridge source, its checked-in preflight/postconditions, current staging schema compatibility, unrelated retained staging rows, and migration-history strategy. Its canonical LF identity is blob `edd6060e81cc891f84724e30a9f70f1fab65af3c`, 48,280 bytes, SHA-256 `3e59df2650dedb1d13dbe604c57ae35c0de9e28409c06cd41332b8ae9020d8d7`.
2. Obtain explicit founder authorization naming **both** M71 predecessor installation and P-17 qualification on the exact staging project. The prior Resource Hub staging authorization does not authorize this migration.
3. Apply only M71 through a named single writer and a reviewed managed-history version/name. The production history mapping `20260819203614` is provenance, not permission to invent or reuse a staging history row. Record the chosen staging history mapping in the authorization and receipt before execution.
4. Verify M71's five tables, fourteen functions, append-only event trigger, zero direct table grants, forced RLS, and service-role-only bounded RPCs, plus PostgREST denials and baseline equivalence. Stop on any mismatch. Only then run the P-17 precheck.

### 2. Controlled migration installation

1. Extract the canonical LF Git blob from the pinned source, verify Git blob `1bc153c...`, 16,759 bytes, and SHA-256 `98cce457...` immediately before apply.
2. Run the checked-in read-only precheck and archive its complete output.
3. Apply only this migration once through a transaction-capable, named managed executor. Do not use a directory-wide push.
4. Record history exactly as version `20260927203000`, name `research_status_recovery`, only after successful commit. Do not use `migration repair` to conceal a mismatch.
5. Run the checked-in postcheck and an independent catalog query. Verify two tables, five exact-signature functions, function owner `postgres`, `SECURITY DEFINER`, expected volatility/config/body hashes, and no unexpected objects.
6. The migration contains its own `BEGIN`/`COMMIT`, so do not claim a rollback-only wrapper around those bytes. Source-level apply-twice behavior was already proved on disposable PostgreSQL 17. On managed staging, a second execution is optional only if the named executor can prove it will not create a second history row, touch unrelated objects, or disturb retained data. Otherwise record the managed apply-twice check as not run; do not downgrade the first-install checks.

### 3. ACL, RLS, and Data API/PostgREST checks

Required results:

- Both recovery tables have RLS enabled and forced.
- No table policies create an alternate client path.
- `PUBLIC`, `anon`, `authenticated`, and `service_role` have no direct SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges.
- PostgreSQL 17 `MAINTAIN` is explicitly checked and absent for every client role; do not assume `ALL` reporting proves this.
- All five functions are owned by `postgres`, are `SECURITY DEFINER`, and have the candidate body/config hashes.
- Only `service_role` has EXECUTE. `PUBLIC`, `anon`, and `authenticated` have none, including when null ACL/default privileges are expanded.
- PostgREST table reads/writes by anon/authenticated/service-role endpoints are denied rather than returning protected rows.
- PostgREST RPC calls with anon/authenticated credentials are denied for all five functions.
- Service-role RPC calls work only from the staging server boundary. The service credential is never put in the browser, URL, evidence, or logs. Supabase documents that service-role/secret access bypasses RLS, so the explicit table revokes and server-only handling are independently verified.

### 4. Synthetic functional and security qualification

Use a unique run ID and fresh `.invalid` addresses. Create only the minimum synthetic assisted-order fixture owned by the run. Never use a retained or real identity.

Required checks:

1. Matching, wrong-email, unknown, malformed, Care-format, and unrelated references return the same public 202 shape and no-store/no-referrer headers. Only the exact eligible Research fixture creates a synthetic outbox event.
2. Outbox capture proves the recipient is re-read canonically from the order row. Mutating an outbox display recipient cannot redirect the credential.
3. No raw recovery or session token appears in database rows, outbox payload after capture policy, application logs, PostgREST logs, browser storage, analytics, screenshots, URLs after capture, or committed receipts. Store only hashes and redact secrets.
4. Scanner/prefetch GET and initial link navigation do not consume. Same-tab `hashchange`, address-bar paste, back/forward, refresh, malformed fragment, and active-session cases remove the fragment safely and preserve explicit `View status` POST as the only consume action.
5. The exchange sets the exact secure, HttpOnly, SameSite cookie expected for the staging origin. Cross-origin requests and origin injection fail.
6. Two genuinely independent database connections and two concurrent managed API/PostgREST requests race the same token. At most one exchange succeeds, exactly one session is durable, and the token is consumed once.
7. Replay, exact-boundary expiry, future/invalid times, revoked/replaced token, ended session, expired session, wrong session digest, and malformed token all fail closed.
8. Status projection is exact-subject only. Wrong-owner, changed-owner, cross-order, browser-only email, signed-out, expired-account, and unrelated-order attempts disclose nothing.
9. R-09 configuration is proven from observed cookie/origin behavior, not only environment declarations.
10. R-04 timing is measured across sufficiently many matched and unmatched requests on managed infrastructure. Report distributions and overlap without logging identifiers. A statistically meaningful difference is a substantive failure and stops qualification.
11. R-05/R-06 behavior is recorded as known P3 behavior: retry within the bucket, consumed-link re-request, and no-message outcome must not be silently reported as fixed.

### 5. Cleanup, rollback, and stop conditions

1. Stop delivery workers before cleanup. End/revoke every run-owned session and revoke every run-owned unconsumed token.
2. Delete only synthetic rows whose exact IDs were recorded by this run, in dependency order: recovery sessions, recovery tokens, synthetic outbox events, synthetic assisted-order events/lines/documents/tokens as applicable, then the synthetic request. Never use broad predicates.
3. Prove baseline counts and all pre-existing row fingerprints are unchanged; prove zero run-owned live credential, outbox item, cookie, account, object, or browser state remains.
4. Preserve redacted receipts, catalog hashes, request/result counts, race ordering, HTTP headers, and cleanup postchecks. Do not preserve raw tokens, cookies, secrets, passwords, patient data, or customer PII.
5. If migration/security qualification fails, stop. Do not weaken ACL/RLS, alter the candidate, repair history, or improvise a partial rollback. The preserve-first rollback document requires separate review: disable application routes/delivery, revoke function execution, revoke live credentials, retain audit evidence, then drop routines/tables only after a separate authorization and retention decision.
6. A successful run on the existing staging project leaves the exact M71 and P-17 migrations each installed once, with all run-owned synthetic data removed. It does not authorize production, merge, deployment, migration promotion, hosted production configuration, or real email.

## Required receipts

The future run must produce a single evidence bundle containing:

- authorization text and author/time;
- named executor/session and single-writer assertion;
- fresh project/service/origin identity and production-negative checks;
- exact runtime SHA/tree and canonical migration bytes/checksum;
- before/after migration history for M71 and P-17, including the supported staging history version and name used for each;
- precheck, apply, postcheck, catalog, ACL/RLS/MAINTAIN, function-body, and PostgREST results;
- synthetic fixture manifest and outbox-capture proof;
- race/session/isolation/browser results;
- timing distributions for R-04;
- cleanup results and baseline equivalence;
- explicit staging/production/email mutation statements;
- limitations and unresolved P3 list.

## Exact authorization required before any staging change

The repository supplies the exact Supabase target and both source checksums. The current target is missing M71, so authorization must explicitly cover its independent review and installation before P-17. Three fields remain to be resolved: the named executor/session, the exact hosted non-production application service/origin, and the M71 staging history mapping chosen through supported migration tooling. There is **no executable staging authorization yet**. After the predecessor compatibility review and these fields are filled, the founder/authorized release owner can grant the following bounded authority:

> I authorize `[NAMED EXECUTOR AND SESSION]` as the sole writer to run the bounded M71-then-P-17 managed-staging qualification against Supabase project `xenios-research-staging` (`tetynodzrtmdbuzgboro`) and only the non-production application service `[EXACT STAGING SERVICE ID]` at `[EXACT HTTPS STAGING ORIGIN]`. The application candidate is runtime `c213707a9d80ecc9f772b5790acb52f1fa503da7`, tree `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`. After a fresh compatibility and retained-state review, I authorize installing only the M71 assisted-order bridge from canonical LF Git blob `edd6060e81cc891f84724e30a9f70f1fab65af3c`, 48,280 bytes, SHA-256 `3e59df2650dedb1d13dbe604c57ae35c0de9e28409c06cd41332b8ae9020d8d7`, with exact supported staging history `[M71 HISTORY VERSION AND NAME]`, and verifying its complete ACL/RLS/RPC boundary. Only after that passes, I authorize installing P-17 from canonical LF Git blob `1bc153c1f32e7806fd30d33ebc67ce25ec61e40e`, 16,759 bytes, SHA-256 `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`, recorded once as migration history version `20260927203000` / `research_status_recovery`. I authorize staging-only `NODE_ENV=production`, `SITE_URL=[EXACT HTTPS STAGING ORIGIN]`, and a new unique staging-only `RESEARCH_SESSION_SECRET`, with secret values never recorded. I authorize only minimal run-owned synthetic `.invalid` fixtures, synthetic outbox capture with every real delivery provider/worker disabled, the ACL/RLS/PostgREST/token-race/session/owner-isolation/browser checks in this handoff, and exact-ID cleanup of synthetic data. I do not authorize production access or mutation, production secrets, production origins, real email, real users, customer data reuse, charges, a directory-wide migration push, migration-history repair, gate weakening, source changes, merge, production deploy, or rollback/drop operations. Stop before the first write on any identity, prerequisite, checksum, history, delivery-isolation, cost, or configuration mismatch. Stop after qualification and cleanup and return the complete redacted receipt.

The authorization becomes exact only after all bracketed values are replaced and the M71 compatibility review is attached. The staging secret itself must be generated and stored through the approved secret manager and must never be pasted into the authorization or repository. A P-17-only authorization would still fail the currently observed predecessor gate.

## Final state

- Verification evidence: reconciled without rerunning the full suite.
- Clean aggregate: supported by the identified Node 20 session log and kept separate from the Claude timeout run.
- P3 backlog: 18 IDs, 1 resolved, 1 original observation disproved, 16 open/deferred.
- Native zoom, reviewed Codex evidence, and viewport proxy: distinctly classified.
- Zoom screenshots: indexed where present; inline session artifacts only, not committed image files.
- Managed-staging plan: complete at the procedure level, with the missing M71 predecessor explicitly identified.
- Executable staging authorization: blocked pending M71 compatibility/history decision, exact hosted staging service/origin, and named executor/session.
- Runtime frozen: yes.
- Staging changed: no.
- Production changed: no.
