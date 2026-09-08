# Resource Hub hardening — exact 8be release packet

**Draft; not qualified for execution yet.** Managed API and browser qualification are complete within the limits below. Formal ASTRA-B exact-source, ownership and evidence acceptance is pending, as is final manifest validation. This packet prepares the current hardening release with the Hub disabled. It does not activate production content or declare the full revenue launch complete.

## Exact candidate, baseline and authority

| Binding | Required value |
| --- | --- |
| Application commit | `8be5d582586217e4cf531e718c65032b79152022` |
| Application tree | `6fc71d0a896d31d0843dd1eb63fa6265a3da9d28` |
| Current live and application rollback | `3814c687ef9293f84f939c372fdbc01b278a9193` |
| Rollback tree | `62915f1f23e16610c74622723391e9692fe7c84e` |
| Current live deploy | `dep-dag1reu7bikc73e16ie0` |
| Render service / workspace | `srv-d8s9vej7uimc7384dfcg` / `tea-d8nhh6a8qa3s73f4ocj0` |
| Production Supabase | `yvzeduaxbwgcwllhywff` |
| Service branch | `release/early-access-code-session-checkout`; auto-deploy remains off |
| Evidence snapshot used here | `594e32373301fce1986a03c89797e3f85ed4e4d0`; subsequent packet commits are evidence, not deploy targets |

A remains the sole production executor; B independently verifies. The standing founder directive is preserved at artifact SHA-256 `3b525ea83b308e30c64d55481b3210ae845a4074e95230813b3bbcf9b1a36b63`. It covers qualified in-scope staged successors after their required independent review and checks. This is an artifact hash, not a commit or self-issued release acceptance. See [authority record](standing-conditional-authorization-20260908.json). The draft's missing acceptance does not require the founder to repeat the existing general authorization; it requires closing the actual gates.

The production delta changes three existing Hub runtime files: upload recovery repeats winning SHA/filename binding; review transitions compare expected state and review provenance; provider timestamps retain microsecond precision. No route, database migration, table, function, RLS policy, grant, dependency or production flag is added. The complete `3814..8be` diff is 51 paths, including records, tests and the original qualification harness. Later API harness, browser host and browser driver commits are separately pinned test tools; do not deploy those commits or evidence HEAD. The separate partner-training copy follow-up is excluded.

## Completed evidence and its limits

The [draft manifest](hardening-manifest-draft-8be5d582.json) retains the original exact-source audit and a hash catalogue. The following hashes are SHA-256 of committed Git blob bytes at the evidence snapshot, not hashes of private raw service responses:

| Receipt | Git-blob SHA-256 |
| --- | --- |
| [Original hardening gates](hardening-qualification-8be5d582.json) | `b31d6993f9f0f76d422e42c916ce3644c8e02389e73e5483333f22a35f083bbf` |
| [Actual managed API](managed-api-qualification-711bd411.json) | `bb5357bc20d467b32d3f90ce74223a470b02785eec1af90b2f1af71590d007a5` |
| [Actual browser, hosts and SQL](managed-browser-qualification-9d33ab53.json) | `e1105bb3df85bd464bd9f3b406c97d1e02628e1064a4414362c6ed26dffea092` |
| [Supplemental ownership map](supplemental-source-ownership-review-8be5d582.json) | `5ba0f1bb8cffb7267d9f51cef8711bc65db03f8f9188577fead44a42f8cda3c8` |

Exact `8be` application-plus-harness TypeScript, build, route uniqueness (433 registrations / 424 call sites), protected core (28 checks), and strict scan passed. The scan covered 4,636 added lines / 51 paths with zero raw or unresolved secrets and zero PII, without allowances or skipped scanning. The approved bounded V3 input remained unchanged. Historical handwriting/name-format/privacy-input limitations remain; this is not unrestricted PII clearance or a scan of later test-tool commits.

The full suite passed 16,086 tests, with zero failed, 59 skipped and zero todo. There were 919 files containing executed passing tests and five entirely skipped files; the raw helper's 924 “passed files” includes those five. Existing skip predicates and affected test bodies were unchanged from `3814`. The 782,237 ms run used Node 20.19.0, one worker, no file parallelism and explicit `--testTimeout=120000`. It does not prove default-timeout or c350 timeout equivalence. Original overbroad `assertionsOrTimeoutsWeakened:false` wording remains preserved and is superseded by the draft's explicit timeout clarification. Focused runtime proof has 140 passing cases; the integrated original harness has 56. The available focused receipt retains results/files/hash/times but not the original CLI string; no invocation is invented or completed test rerun solely to recreate that metadata.

The original build log retained warnings and lacked a contemporaneous output inventory. Original launcher/config hashes were captured retrospectively. Separately, the actual browser qualification verified served assets against a retained complete 341-file manifest, SHA-256 `7cca385f69df2506e7842b976bfd25e2417cb47660fa7de4eda156a48cfe948f`. Later evidence does not silently rewrite the original build provenance. Application runtime/source binding to `8be` was checked; neither changed test tools nor documentation successors inherit blanket full-suite/scan qualification.

Managed API harness `711bd4113b9a2458f7c9b46b50a088c8db728677`, tree `c5f59f8d15b022bd822fc0e6cb71233d1fad6c48`, passed 41 actual checks on existing staging `tetynodzrtmdbuzgboro` at `17:18:03.222Z`. Its private result/journal hashes are `30be375950e78b69c44ef639d6fd4dcf788a5baa15ddd2252b761d66eb7d82b0` / `a7e164918c069359a47146d3dd3704c1dacc03567a3303a638b270d7ebf3aec8`. The proof includes real canonical Auth/provider composition, same-byte controlled upload competition, full-precision timestamp/CAS and provider-error distinctions, review/publish/withdraw, role/audience refusals, private delivery and retained orphan/audit accounting. The receipt distinguishes 29 write attempts, 24 acknowledged writes and five expected refusals. Different-hash stored upload races and unfiltered retained-library/bucket-wide orphan behavior remain unproved. Earlier failed preflight and zero-effect reconciliation remain retained.

Browser host `2873a333255c015789594920493e10c6b82461b8`, tree `d93e1d3409d74a5ab61f83df65fc7676a7941471`, used source-file hash `8edbab84599aa06ad7a60821d2b3754ebb92937aae20a36dcb5e71cee81eb3ad`. Driver `9d33ab5370b39cb6400e22db2e3026dbb3276d2c`, tree `b43359d97e326eda7aacd44c9b0f0e69e05e2252`, used source-file hash `d7a98d298698929a1cc8a10385e5323211a5afb2ac4690e353852530ad3e7cfe`. The run completed at `18:01:01.026Z`: 15 steps and 45 captures across nine widths/five role states passed, with eight ordinary password logins/eight UI sign-outs, exact saved bytes, mounted logout discarding pending bytes, same-context account switching and withdrawal visibility. Private result/journal hashes are `d33399f93ed987bfe8b3a8b3aa4a7133110f25ff1c8fe20b640305497236d833` / `fd176cba002c32e202de1c2e29c1ade68316d29f2fbb749da4cef76f23f145f9`.

Both hosts stopped gracefully; all 203 provider attempts have matched successful responses. Host A/B receipt hashes are `bbe6fa3f390437fc3a2fc03a9c75367aeaa7564463176be744ef1f1e8c41b408` / `aadf8c9af75480e2cf9dd2ace83b2d5b531a860dd2799920360eb334982b51e1`. SQL at `18:01:23.657536Z` reconciles five resources, three withdrawn versions, five private objects, eight delivery audits, zero published pointers and unchanged outbox count two; raw receipt hash `e9b64f49e51236df73fa58a08420bcdceb5ae360cefe0b8e37d3e6ba12dceca1`. Version-detail receipt hash is `dee4520ae1d41b8b58840844df96b5bb66f39ec62dddbe2836b15f8ea8d9e1e8`. Prior rows and unsuccessful-run evidence are preserved. The browser added only one resource/version/object and two delivery audits, with two review updates, one publication and one withdrawal. All copies use one 2,333-byte synthetic PDF, hash `9bf66f0c5ed7ce28d90cb0dca3a3402067a0b8df61a00a0ab8f833fc5f03a198`.

The independent helper accepted the browser/host/SQL reconciliation and all screenshot hash/size/dimension checks. This does not substitute for ASTRA-B acceptance. Browser limitations remain explicit:

- Real staging Auth/data ran through a bounded same-origin loopback proxy; direct production-origin Auth is unproved. Host B saw only retained run-owned fixtures, not Host A's new resource.
- Incidental non-Hub shell APIs deliberately returned 503. There were 23 console-error events with no retained raw classification, zero page errors, zero boundary refusals and zero asset failures. This is not full production-shell or zero-console-error qualification.
- Two delivered member audit rows represent server retrieval; one member download was saved and the pending second response was discarded after logout. An audit row alone does not prove browser receipt.
- A inspected ten representative screenshots; all 45 hashes/dimensions/overflow checks passed. At 320 px partner navigation remains clipped/scrollable. Admin resource-count helper wording includes retained empty resources. These recorded follow-up limitations are not silently repaired in this release.
- Synthetic staging PDF metadata and screenshots are private qualification material, not approved production content. No real-user journey or new real-user grant was tested.

## Database and current configuration

[Fresh compatibility](hardening-readonly-compatibility-8be-1808.json) has raw/LF SHA-256 `bd59226e483d2473b173860e398126d4abf9cff27d7487d15dd34ac3a500d9f6`. These exact bytes are pushed at evidence commit `75467fb5f65b559cec5234bd7190b50a1094c364`; require that hash when integrating this packet. Render read at 18:04 and configuration at `18:08:08.270Z` show live `3814`, no active/queued deploy, unchanged branch, auto-deploy off, `npm run start`, direct Hub=false, founding=true, membership billing absent, and zero environment groups. These are stored observations; effective running flags were not independently verified by that read.

Production SQL at `18:04:55.384597Z` returned PostgreSQL 17.6 and zero Hub resources/versions/deliveries/objects. Installed history is `20260907143147`, `20260907143204`, `20260908143724`. A then ran the exact unchanged read-only Hub postcheck successfully. Its private result hash is `12048c63d7c268d58942d083947ac4a4cca871c89970479ece042fcb4efce4dc`; the initial SQL result hash is `a07f6957123cff9ab0321c1b44286544dad2f20bcf8a9b4cb6bed7637324a11c`.

**Apply no migrations.** Candidate and managed migration bytes are already installed. These files are identical between `3814` and `8be`:

| Existing file under `supabase/candidates/` | LF SHA-256 |
| --- | --- |
| `20260906120000_research_resource_library.sql` | `e55f965fbc942b4de6ec7b74b2bc28b8d7eff8dd6530f50c9876d3137e8dd722` |
| `20260906120000_research_resource_library.precheck.sql` | `742bce5729a0b4c2db848fbf32658efe0b286c5b910730fd6bfc9182c1ea6fab` |
| `20260906120000_research_resource_library.postcheck.sql` | `7c7ef33b7091cc1946077070ca6587491b299c5101ca05b4b70dcf95ff379550` |
| `20260906120000_research_resource_library.rollback.md` | `1c8261fbb1723c7ef0d47fdd6a8f65d150ff7931ee8d3b2f896b134a8dea4153` |

The original first-install precheck intentionally rejects existing Hub objects; it is not the retry gate for this installed-schema release. Use authenticated read-only history/object inspection and the exact postcheck with unfiltered visibility and stop-on-error. Any mismatch, unexpected row/object or failed assertion stops execution. Never replay either copy, repair history or delete data to force a pass.

## Required checks and execution

These commands describe the remaining executor procedure; packet preparation did not run them. Preserve successful exact-8be suite/build/scan evidence and its source binding. Do not rerun unchanged completed proof without a new source/failure concern.

1. Obtain actual ASTRA-B acceptance of `3814..8be`, the 51-path ownership findings and final managed/browser evidence/limits. The trusted baseline ownership policy SHA-256 is `8f84c67cefa29dab41194fd9e6c6f574ca65c55d40b141803b06139ee26b6cce`; the supplemental map has 14 covered and 37 unowned paths, zero wrong-lane/conflicts. Its path digest is `a6b6c4687bad3b984694ba14765d06fef5f9e0436ce15386b8cf40d728b0fdf8`; findings digest is `69ecb7505f54e7486e456e5bc3f78ba14724b197d73465e15752b039b0d75fcd`. B must supply the real review identity/time/disposition and staged artifact/hash. Do not copy the historical 3814 attestation or trust newly loosened ownership rules.
2. A finalizes the standalone schema-v2 manifest and consistent release-control records, including the real B artifact. The current JSON is a draft envelope with `integrationOwnershipReview:null`, not that accepted manifest. Review the missing focused-command metadata honestly. Run the existing validators with externally pinned identities; the verifier reads the attestation bytes from the Git index:

```powershell
$releaseNode = 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe'
$env:XENIOS_EXPECTED_PRODUCTION_SHA = '3814c687ef9293f84f939c372fdbc01b278a9193'
$env:XENIOS_EXPECTED_HEAD_SHA = '8be5d582586217e4cf531e718c65032b79152022'
$env:XENIOS_EXPECTED_OWNERSHIP_SHA256 = '8f84c67cefa29dab41194fd9e6c6f574ca65c55d40b141803b06139ee26b6cce'
# Set $reviewedManifestPath to A's actual standalone finalized manifest.
& $releaseNode node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-release-manifest.ts $reviewedManifestPath
& $releaseNode node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-production-state.ts
& $releaseNode node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-migration-dag.ts
& $releaseNode scripts/agentic/xenios-os.mjs validate
git diff --check
git diff --cached --check
```

Require each exit code zero before continuing; a prior accepted installation manifest is not this candidate's acceptance. Preserve any failed invocation/result. Verify `git rev-parse "8be5d582586217e4cf531e718c65032b79152022^{tree}"`, pushed ancestry, all exact file hashes, no application/build-input drift, authenticated target/service/workspace, current live `3814`, single production writer, no active/queued deployment and unchanged branch/auto-deploy. Refresh remote observations immediately before a mutation; old reads do not authorize retrying an uncertain operation.

3. Keep Hub=false and membership billing absent/false; no forward flag activation or new config is proposed. Do not toggle the observed founding=true for this forward release. Verify `NODE_ENV=production` from the actual deployed process and disabled Hub behavior after restart. The flag is captured at composition/startup; stored values alone cannot establish the running state. Existing application startup/outbox/scheduled behavior is unchanged and may perform ordinary due work; this is not a zero-effect restart. Do not trigger jobs for smoke.
4. Capture the existing 30 public unauthenticated GET endpoints immediately before deployment. Preserve output in a new evidence location. This capture includes all three Care routes and no Hub download GET/HEAD:

```powershell
# Set $baselineCapture, $candidateCapture and $comparisonOutput to fresh evidence paths.
& $releaseNode scripts/release/critical-endpoint-diff.mjs capture --base-url https://xeniostechnology.com --out $baselineCapture
# After exact candidate is live, repeat capture into $candidateCapture.
& $releaseNode scripts/release/critical-endpoint-diff.mjs capture --base-url https://xeniostechnology.com --out $candidateCapture
& $releaseNode scripts/release/critical-endpoint-diff.mjs compare --baseline $baselineCapture --candidate $candidateCapture --expectations docs/revenue-launch/20260907/critical-endpoint-no-allowances-3814.json --out $comparisonOutput
```

The reused expectations file contains `intentionalChanges:[]`, Git-blob SHA-256 `55e18bf27da40a13d2dacb2b010ab5297e4a06cc850da5f9dd75f597cca89a09`. Its historical comment does not grant a comparison allowance. Run only the first capture before deploy; the candidate capture/comparison occur after live identity.

5. When the preceding checks and formal acceptance pass, use the supported exact-commit Render deploy API for service `srv-d8s9vej7uimc7384dfcg` with `commitId=8be5d582586217e4cf531e718c65032b79152022` and `clearCache=do_not_clear`. The generic trigger without a commit parameter is unsuitable. Preserve the returned deploy ID/commit/status, wait for live, and reread the actual serving identity. Stop and inspect actual remote state before retrying any uncertain request; do not substitute branch HEAD.
6. Require **30 SAME, zero intentional changes, zero regressions and zero human-review-required differences** with empty allowances; verify public health and unauthenticated account/admin boundaries. Stop on identity, compatibility, hash or smoke mismatch. Do not turn Hub download/audit writes or real account actions into “read-only” smoke.
7. After live identity and initial smoke pass, observe **five full minutes**, check health at least every 30 seconds and inspect error logs over the full interval. Preserve deploy/source identity and timings. Do not shorten the window to satisfy a deadline. A material health/deploy/regression failure requires the compatible rollback decision below.
8. Reconcile actual deploy ID, serving SHA/tree, stored and effective flags, unchanged installed history, smoke/observation and rollback status in production records. Before claiming success, require corresponding receipts. Label the outcome **hardening deployed, Hub disabled; production content and real-user verification pending**.

## Compatible recovery

The current application rollback is exact `3814`, not historical ff3. Both `3814` and `8be` use the same installed additive e55 schema; with Hub disabled, the prior app remains the compatible installed baseline. Recheck observed database state before reverting; any unexpected schema/data recovery need requires its own decision.

Before reverting application code, explicitly set `RESEARCH_RESOURCE_HUB_ENABLED=false` and `RESEARCH_FOUNDING_ACTIVATION_ENABLED=false`, keep `RESEARCH_MEMBERSHIP_BILLING_ENABLED` absent/false, and verify stored values. Deploy exact `3814c687ef9293f84f939c372fdbc01b278a9193` with the same service/branch/auto-deploy restrictions. Complete the required restart and verify the actual serving process and effective disabled behavior; a stored flag edit alone is insufficient. Repeat the strict public comparison and five-full-minute health/log observation. Preserve original failure and all receipts.

Do not drop/replay migrations or delete resources, versions, Storage objects, delivery audits, customer/approval/partner/agreement/audit/billing/outbox history. Preserve the private bucket and ACLs. No database repair, pointer repair, orphan cleanup, backup restoration or history rewrite is included. No rollback has been executed for `8be` during packet preparation.

## Remaining activation decision

Missing inputs are the actual reviewed production document bytes/version/hash and metadata/usage policy, authorized audience, named account and exact permitted verification/write/notification effects. The synthetic test PDF and private source-review agreements/registers are not publication candidates. Broad `all_partners` is not a single-account selector; account/partner eligibility must use canonical existing authorities. Direct production-origin Auth and the real recipient journey need separately bounded verification.

Until those inputs and required activation acceptance exist, keep the Hub disabled. No real account approval/claim, partner activation, customer notification/job/email, recruiter/referral rollout, price/commerce activation, payment/refund/purchase/shipment or clinical action is part of this packet. Complete this narrow release; do not add optional features or call it the full revenue launch.
