# Xenios Research full-website release candidate — exact-SHA recut — 2026-08-29

Status: **NOT READY — C015 FULL EVIDENCE SEALED; PACKET FINALIZING**

This is a release-readiness record, not a deployment authorization. No
deployment, migration, environment change, account or invitation action,
product activation, pricing, payment, refund, Tebra activation, or external
communication occurred while preparing this recut.

## 1. Exact identity and release layers

| Item | Exact value |
| --- | --- |
| Current production SHA | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Current live deployment and rollback target | `dep-da94g05g1s2s7396lkv0` at `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Failed/disqualified release | `eb659d8100a3b9831d52688120931c48d10330d9`, deployment `dep-da94b91srm7s73b55dsg`; its authorization was consumed |
| Runtime code freeze | `2d662a0d31bb1de9332fb5c591f01cab76b991b1` |
| Runtime tree | `c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5` |
| Evidence-control freeze | `c01569169cad5e6619187221d84019ae8bfc7c69` |
| Evidence-control tree | `c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019` |
| Candidate branch | `claude/xenios-research-full-finish-takeover-20260828` |
| Origin verification | Runtime and evidence-control freezes are pushed and origin-verified |
| Final RC identity | `finalRcSha: UNASSIGNED_BY_SELF_REFERENCE` — assign only after the records/evidence successor is committed, pushed, and origin-verified |
| Canonical release manifest | `docs/coordination/release-manifests/XENIOS_RESEARCH_FULL_SITE_RC_2026-08-29.json` |
| Review packet | `docs/review/xenios-research-full-site-20260829/` |

The three release identities are intentionally separate:

1. The runtime freeze contains the product and server behavior being released.
2. The evidence-control freeze changes exactly these seven evidence/test
   controls relative to the runtime freeze:

   - `scripts/evidence/routes.public.json`
   - `scripts/evidence/routes-public.test.mjs`
   - `scripts/release/critical-endpoint-expectations.json`
   - `scripts/evidence/lib/cdp.mjs`
   - `scripts/evidence/network-boundary.test.mjs`
   - `scripts/evidence/capture-synthetic-journeys.mjs`
   - `scripts/evidence/capture-synthetic-journeys.test.mjs`

3. The eventual records/evidence successor will bind the final machine results,
   packet, and review records. It must not alter runtime code or the frozen
   evidence controls. Only that pushed successor can be named as the final RC.

A Git commit cannot embed its own SHA. Samuel's later authorization must name
the exact final RC SHA reported after the successor exists.

## 2. Failed deployment and deterministic closure

The failed successor `eb659d81…` was deployed at 2026-08-29T02:37:19Z and
rolled back at 02:47:15Z to `3daa3f4a…`. Its assisted-order config route
regressed from live HTTP 200 to the generic API 404. The first diagnosis
incorrectly included `submissionStanding`; that value actually derives from
the agreement gate. The missing production dependency was the mandatory
durable audit authority.

The frozen runtime makes audit behavior explicit as `durable_store`,
`log_line_nondurable`, or `unavailable`; uses the production composition root;
and always registers explicit assisted-order responses. There are ten
registrations: the config GET probe plus nine operational routes—catalog GET,
submit POST, public-reference status GET, upload-URL POST, document-complete
POST, admin-list GET, admin-detail GET, admin-status PATCH, and
admin-download-URL POST. Production-root tests prove that enabled config is
HTTP 200 and cannot fall through to generic 404; deliberately unavailable
composition is explicit and fail-closed.

The immutable incident timeline is recorded in
`DEPLOY_RECORD_2026-08-29_FULL_SITE_RC_EB659D81_ROLLBACK.md`.

## 3. Current completion map

| Item | State | Blocking? | Exact evidence or boundary |
| --- | --- | --- | --- |
| Runtime freeze | FROZEN; no release-blocking runtime defect reproduced | No | `2d662a0d31bb1de9332fb5c591f01cab76b991b1` / `c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5` |
| R11 technical bundle | PASS; 21/21 summary rows; true runner exit 0 | No | `C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux` |
| Evidence-control freeze | FROZEN; exact seven-path evidence/test delta; pushed and origin-verified | No | `c01569169cad5e6619187221d84019ae8bfc7c69` / `c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019` |
| Historical db9 smoke | PASS as a bounded predecessor only: 9/9 HTTP; 54 browser captures = 30 PASS + 24 NOTES + 0 FAIL; candidate config 200; not current c015 final validation | No | `C:\tmp\xenios-smoke-db9aeaa-r11-repin-summary.json`, SHA-256 `b3dbeb7f4be73931758df89561599a00a3628a778010d5edd7da44c374e5507e` |
| Corrected final evidence retry1 | EXCLUDED_EXTERNAL_INTERRUPTION after host Modern Standby caused CDP loss; 224/1,100 = 180 PASS + 44 NOTES + 0 FAIL; targeted partners 11/11 PASS; no product/harness defect | No; diagnostic only | `C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry1-20260830` |
| Corrected final evidence retry2 | `EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE`; primary 1,100/1,100 = 1,023 PASS + 77 NOTES + 0 FAIL and focused gates PASS; synthetic stopped 10/20; 3 valid diagnostics = 1 PASS + 2 exact race reproductions; no product/network failure | No; diagnostic only | `C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry2-20260830` |
| E641 canonical synthetic smoke | EXCLUDED: 2 PASS + 1 FAIL; superseded by c015 | No; diagnostic only | Exact `e64122d67671113b02e1af2e1ba6b967a48767da` / `433a694d20cd1c05cb2bd39c31939d57d917d19c` |
| C015 focused and canonical prerequisite | PASS 53/53; prerequisite 3/3, each 20 = 18 PASS + 2 declared notes + 0 FAIL; boundary 0; PII CLEAN | No | Exact `c01569169cad5e6619187221d84019ae8bfc7c69` / `c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019` |
| Retry3 | `STOPPED_PRE_EVIDENCE_WRAPPER_SCHEMA`; exact clones/build and actual 3 suites/23 tests PASS; wrapper incorrectly required one suite; guard reset; no reuse/candidate defect | No; wrapper-only historical attempt | Runner SHA-256 `10631b1c606ec6ab5d6e553c64678bd334ac58d197f3f18c8c004d1b3eb8c6d3` |
| Retry3b | `STOPPED_PRE_PREVIEW_WRAPPER_SCHEMA`; network 23 PASS and routes 17 PASS; wrapper assumed fixed suite total 3 while Vitest reported describe-block totals 3 then 2; guard reset; no reuse/candidate defect | No; wrapper-only historical attempt | No preview, HTTP, browser, or evidence root existed |
| Retry3c full evidence | `FULL_EVIDENCE_SEALED`; HTTP 100/100; browser 1,100 = 1,023 PASS + 77 expected notes + 0 fail first attempt; focused 11/11, 11/11, 11/11, 11/11 and 99/99 clean; synthetic 20 = 18 + 2 expected denial + 0; evidence tests 13 files/213 tests/46 suites; scan 0/0 non-skipped; PII CLEAN 0 across 2,332 text / 1,120 PNG manual-review inventory / 0 unscannable | No | Evidence manifest SHA-256 `1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257` |
| Release packet and ownership | Bounded packet generated/validated: 192 files = 191 payload + self; inventories `6dab7745…` / `f6ef58ea…`; manual QA 18 PNG/9 areas/2 viewports, 0 blocking visual/0 privacy; canonical manifest PASS `16f08fd2…`; ownership `84ae795d…` attested/dispositioned nonblocking | No; packet generation/validation closed | Canonical manifest and review-packet paths in section 1 |
| Records/evidence successor | Does not yet exist; `finalRcSha` remains unassigned by self-reference | Yes | Must be committed, pushed, origin-verified, and leave the worktree clean |
| Detached Codex review | Must review the pushed final RC read-only | Yes | Requires P0 0, deployment-blocking P1 0, critical P2 0, verdict PASS |
| Human authorization | Not requestable at this boundary | Yes, only after all preceding blockers close | Samuel's exact-final-RC-SHA GO becomes the sole remaining human blocker only after closure |

## 4. R11 exact runtime technical results

The sealed technical bundle ran against the exact runtime freeze in a clean,
detached, network-disabled Linux gate environment with Node `20.19.0`, npm
`10.8.2`, and pinned image
`sha256:a5fb035ac1dff34a4ecaea85f90f7321185695d3fd22c12ba12f4535a4647cc5`.
The non-masked runner completed at `2026-08-30T16:55:41.4746697Z` with exit
0 and 21/21 PASS summary rows.

Evidence root:

`C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux`

| Gate | Exact machine result |
| --- | --- |
| TypeScript | PASS; exit 0; 0 errors |
| Production build | PASS; client 9.39s; server 247ms; root, Research, Hino, and static outputs present; 94 built font assets; 0 `data:font` CSS assets |
| Complete sequential suite | PASS; 807 files total = 803 passed + 4 skipped; 12,092 tests total = 12,049 passed + 43 skipped; 0 failures; 469.08s |
| Canonical E2E | PASS; 4 files; 53 tests; 0 failures/skips; 2.73s |
| Assisted-order production boot/HTTP | PASS; 6 files; 115 tests; 0 failures; 20.33s; enabled config 200; explicit unavailable behavior; ten registrations |
| Endpoint/static/SEO/Hino | PASS; 4 files; 79 tests; 0 failures; 2.41s |
| Commerce/Care/security targeted domains | PASS; 196 files; 3,116 tests; 0 failures; 152.53s |
| Evidence tooling | PASS across two Vitest runs; 13 files; 208 tests total = 196 passed + 12 intentional network-disabled boundary skips; 0 failures |
| Route census/parity | PASS; 1 file; 17 tests; 0 failures; 568ms |
| Release-diff self-test | PASS; TAP 8 passed; 0 failed; 621.884681ms |
| Route uniqueness | PASS; 409 static registrations across 400 call sites |
| Migration DAG | PASS; 35 nodes; canonical checksums verified |
| Release control plane | PASS; check gate exit 0; test gate 1 file and 52 tests total = 51 passed + 1 intentional skip; 0 failures; 20.69s |
| Core protection focused test | PASS; 1 file; 35 tests; 0 failures; 283ms |
| Source secret scan | PASS; 0 findings |
| Non-skipped approved-name PII scan | PASS; 0 findings across 223,375 added lines in 608 files |
| Migration for this deploy | NO; not authorized; not applied |

Machine provenance:

| Artifact | SHA-256 or exact value |
| --- | --- |
| `runner-completion.json` | `99ba7ad5fb95b0c7fb7f7204eaf9bb6e157daeee92fcd1927d06e51d7c459762` |
| `summary.tsv` | `53f2414554c34cbed0a056313a2e4cc6a6b70abd24628bc1f4c088245e4b2687` |
| `source-post-audit.log` | `c65050ea7e36e22aee7def5ead275760652423a30110096953bbbc6451447855` |
| `harness-provenance.json` | `9004e4af7dd594582b0abb1fd0c98ebc20540c4b91166e0304bea97ceae4e330` |
| Approved-name PII corpus | 6,463 bytes; SHA-256 `c7da9838a3a8236a1b94465f3bfe21121fcc0de9dc586f8c08e167cf7d9ac34b` |
| R11 PowerShell runner | `b00e298f60479316a7f4ff1be9a34e49941b1635dafee83352fae2b5e288cc26` |
| R11 gate shell | `9a4e61c0d90524f474707ce28e3f96f85837878f9e7532c7893da07b46cb5bc6` |
| R11 source verifier | `7726f79b37f13b6a0c16563c14b73cef7ed29bde02db5aade7ec7cde708d8068` |
| R11 source seeder | `a7c04e7cf21cb2513d28315918ff9fb0e98cd69ae12eb4eb603b86c15f86de93` |
| R11 Vitest config | `336e8e403ba3b623622a17e471228f665f948e4ff903c93d54a393e107975196` |
| R11 E2E config | `c8a60ebff885e95b1f1f5ffdb6ddf8f61238710f0858f1da61188f518ea7d08c` |

The full runtime suite does not need to be rerun for the frozen evidence-only
controls or a records-only successor. Any later runtime or test-source change
outside the declared evidence controls invalidates the corresponding reuse and
requires the affected technical gates.

## 5. Critical endpoints and core-site protection

At current evidence freeze `c0156916…`, retry3c's successful reserved-fixture
endpoint recapture covered 27 endpoints: 16 `SAME`, 11 narrowly pinned
`INTENTIONAL_CHANGE`, 0 `REGRESSION`, and 0 unresolved human-review results.
Assisted-order config was HTTP 200 and the HTTP stage passed 100/100.
Historical predecessor `193b307…` also passed
the checked-in offline expectation verification, and excluded retry1 recorded
the same endpoint classification with both assisted-order config probes HTTP
200. The successful reserved-fixture recapture is part of the sealed c015
evidence and is represented in the validated bounded packet; it does not
substitute for the records/evidence successor or detached review.

The core classifier remains deliberately strict. Its raw exit is `1` because
reviewed out-of-zone paths are disclosed rather than silently allowlisted. The
review wrapper result is `PASS_WITH_DISCLOSED_ZONE_LISTING`. Exact R11
classification:

- 719 changed paths total;
- 253 Research/Care paths;
- 209 infrastructure paths;
- 216 test paths;
- 8 permitted seam paths;
- 33 reviewed out-of-zone paths; and
- 24 protected file hashes verified with zero mismatch or missing path.

The categories reconcile exactly: `719 = 253 + 209 + 216 + 8 + 33`. The raw
classifier was not weakened. The canonical R11 log is
`C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux\core-site-protection.log`,
SHA-256
`5210b246885d0a3912f1ce72b94b81065034cb7f3d0c27547d0511c5991021bc`.
The per-path disposition is maintained in
`XENIOS_RESEARCH_CORE_SITE_PROTECTION_DISPOSITION_2026-08-29.md`.

## 6. Corrected final evidence boundary

Retry1 at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry1-20260830`
is `EXCLUDED_EXTERNAL_INTERRUPTION`. The run completed its fresh build,
critical-endpoint comparison, and 100/100 HTTP stages, then captured 224/1,100
primary observations: 180 automated PASS, 44 PASS_WITH_NOTES, and 0 FAIL.
Targeted partners were 11/11 PASS. Windows Modern Standby Event 506 at
`2026-08-30T18:08:41.172Z` and Event 507 resume at
`2026-08-30T18:14:32.725Z` establish that host sleep caused CDP loss. No
product or harness defect was found. Retry1 is diagnostic and cannot be sealed
or promoted as final evidence.

Retry2 at:

`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry2-20260830`

is `EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE`. Its primary matrix completed
1,100/1,100 with 1,023 automated PASS, 77 PASS_WITH_NOTES, and 0 FAIL; focused
gates passed. Synthetic stopped at 10/20 on a service-worker CDP restart.
Three valid diagnostic runs produced one PASS and two exact race reproductions,
with no product or network failure. Retry2 is diagnostic and cannot be sealed
or promoted as final evidence.

The e641 three-run canonical smoke is excluded at 2 PASS + 1 FAIL and is
superseded by c015. Exact c015 focused validation passed 53/53, and three
canonical prerequisite runs each completed 20 captures as 18 automated PASS +
2 declared notes + 0 FAIL, boundary 0, PII CLEAN.

Retry3 is `STOPPED_PRE_EVIDENCE_WRAPPER_SCHEMA`. Both exact clones matched at
3,575 files, 88,285,956 bytes, inventory SHA-256
`7e6a96080f3dc65c7f91f9e87ddb80eaffad5e4a0478a2bdfac7bdf980f097b`, and
0 mismatch with `core.autocrlf=false` before first checkout. Clone/build passed
and the focused JSON actually reported 3 suites/23 tests PASS, but the
temporary wrapper incorrectly asserted one suite. It stopped before HTTP,
browser, or evidence-root creation; the guard reset; no candidate defect was
found; and retry3 may not resume or be reused.

Retry3b passed network-boundary 23 and routes 17, but Vitest suite totals
reflected `describe` blocks (3 then 2) while the temporary wrapper assumed
fixed 3 for the route gate. It is `STOPPED_PRE_PREVIEW_WRAPPER_SCHEMA` and
stopped before preview, HTTP, browser, or evidence-root creation. Its guard
reset, no candidate defect was found, and it may not resume or be reused.

| Gate | Current exact state |
| --- | --- |
| C015 focused and canonical prerequisite | PASS 53/53; prerequisite 3/3, each 20 = 18 PASS + 2 declared notes + 0 FAIL; boundary 0; PII CLEAN |
| Retry3c browser/HTTP evidence | **FULL_EVIDENCE_SEALED**; HTTP 100/100; browser 1,100 = 1,023 PASS + 77 expected notes + 0 fail first attempt |
| Focused evidence | Early 11/11; assisted 11/11; negative 11/11; unknown 11/11; account 99/99; all zero fail and clean |
| Synthetic journeys | 20 = 18 PASS + 2 expected-denial notes + 0 fail |
| Evidence tests | 13 files; 213 tests; 46 describe suites; 0 fail; wrapper-only 46-vs-13 stop disclosed |
| Evidence PII/secret scan | Release scan 0/0 non-skipped; PII CLEAN, 0 findings across 2,332 text / 1,120 PNG manual-review inventory / 0 unscannable |
| Automated evidence manifest | SHA-256 `1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257` |
| Bounded tracked review packet | Generated/validated at `docs/review/xenios-research-full-site-20260829`: 192 files = 191 payload + packet-inventory self; 72 PNG + 72 text = 36 desktop-1440 + 36 mobile-390 pairs; packet inventory SHA-256 `6dab7745cab5246993befd3e7d1ddc12ea6fc7caf08e17a00d2de0d13b3668e7`; payload inventory SHA-256 `f6ef58eae2959f820f27ed0495113dcc2654c25155076bbd6f86a36a06dd4a14` |
| Representative manual visual/privacy QA | 18 PNG; 9 route areas; 2 viewports; 0 blocking visual; 0 privacy findings; five cosmetic/readability backlog items in `review-summary.json` |
| Canonical release manifest | PASS under Node 20.19.0/npm 10.8.2; SHA-256 `16f08fd27b145068388a4c5e59f8163d86f8d70b0d3d48483960bd19e78b109c`; binds bounded packet and assisted-order environment inventory |
| Ownership/control closure | Ownership SHA-256 `84ae795dbe4c945d6d9c3d1a082e8519400451045e1296d7557949952262769c`; 613 unowned + 20 wrong-lane + 0 conflicts attested/dispositioned nonblocking; release-control 51 pass + 1 intentional skip + 0 fail; production-state PASS; migration 35 PASS; route uniqueness 409 registrations/400 call sites exact-c015 PASS |

The machine-derived values above are sealed and the bounded packet is
validated. Its copied automated `evidence-manifest.json` intentionally retains
its pre-successor PENDING state and is distinct from the canonical release
manifest verifier PASS. The records/evidence successor SHA, exact-final-SHA
checks, final RC assignment and detached review remain unassigned.

## 7. Excluded and historical predecessor evidence

Exact-c015 retry3c is the sealed final full evidence set. Predecessors remain
disclosed without being mixed into its counts:

- All `efb30f57…` R10 outputs, including the interrupted r10d attempt, invalid
  r10g attempt, and superseded r10h output, are historical and excluded from
  the final RC because the runtime and evidence-control identities advanced.
- The stopped `db9aeaaf…` full run is excluded; it stopped on stale
  byte-fingerprint expectations before the narrow evidence re-pin.
- The clean `db9aeaaf…` smoke summarized in section 3 is a truthful historical
  bounded preflight. It is not current c015 validation and contributes no final
  matrix totals.
- The initial `193b307…` CRLF-materialized attempt is excluded. It is not
  mixed with either corrected LF retry and produced no final seal.
- Corrected LF retry1 is `EXCLUDED_EXTERNAL_INTERRUPTION`. Its 224/1,100
  partial primary observations and 11/11 targeted-partner result are diagnostic
  only because host Modern Standby caused CDP loss; they are not mixed with
  retry2 and provide no final seal.
- Corrected LF retry2 is `EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE`. Its complete
  primary result and partial synthetic observations are diagnostic only; they
  are not mixed with c015 evidence and provide no final seal.
- The e641 canonical smoke is excluded at 2 PASS + 1 FAIL and is not mixed
  into c015 counts.
- Retry3 is a wrapper-only `STOPPED_PRE_EVIDENCE_WRAPPER_SCHEMA` attempt.
  Retry3b is a wrapper-only `STOPPED_PRE_PREVIEW_WRAPPER_SCHEMA` attempt.
  Neither produced current final evidence, neither may resume or be reused,
  and neither represents a candidate defect.
- Retry3c's wrapper-only 46-vs-13 stop is disclosed separately from its green
  13-file/213-test/46-describe-suite result. The excluded fixture-scan attempt
  is archived at
  `C:\Users\sboad\AppData\Local\Temp\xenios-retry3c-excluded-tail-pii-order-fixture-20260830`;
  it is replaced by the reserved-fixture endpoint recapture at 16/11/0/0 with
  assisted-order config HTTP 200 and contributes no final evidence.

No stopped, superseded, or differently materialized run may be resumed,
combined, or promoted as the final matrix.

## 8. Capability, migration, and operational truth

`XENIOS_RESEARCH_CAPABILITY_MATRIX_2026-08-28.md` is authoritative.
Operational code paths must not be confused with production activation.

Tebra is **PRODUCTION DISABLED AND UNCONFIGURED**. No production credentials,
provider/location/service identifiers, mapping, consent approval, sandbox
verification, or production activation exists or is asserted. No scheduling,
provider, pharmacy, or clinical state is fabricated.

Products are not represented as live without Product Control authority.
Payments, refunds, payout, product activation, clinical writes, and other
intentionally unavailable effects remain fail-closed and outside this
deployment.

Migration required for this deploy: **NO**. Migration authorized: **NO**.
Migration applied: **NO**.

The only recorded nonblocking release backlog item remains the lack of a
durable bounded throttle on the public Tebra configuration GET. Tebra is
disabled, and the endpoint exposes neither secrets nor clinical state.

## 9. Authorization boundary and current verdict

Production remains `3daa3f4a…` at `dep-da94g05g1s2s7396lkv0`; the rollback
target is the same exact SHA. Auto-deploy remains off. The prior `eb659d81…`
authorization was consumed.

Samuel's exact-SHA GO is not requestable while the validated packet and records
await a pushed records/evidence successor, exact-final-SHA, clean-worktree and
origin checks, final RC assignment, and detached Codex review. Once every
remaining machine and review gate passes, Samuel's command naming the exact
final RC SHA becomes the sole remaining human blocker. This document grants no
present production authority.

**CURRENT VERDICT: NOT READY FOR SAMUEL'S EXACT-SHA GO.**

The remaining release work is bounded: commit and push the validated packet
and records/evidence successor, then complete the read-only detached Codex
review.
