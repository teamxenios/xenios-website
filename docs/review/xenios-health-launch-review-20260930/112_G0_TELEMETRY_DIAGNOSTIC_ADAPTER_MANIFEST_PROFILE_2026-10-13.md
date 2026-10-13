# Revision 13: three source-only prerequisites — G0 refusal telemetry (A), target-lifecycle diagnostic adapter (B), release-manifest validator profile with parent R2 (C)

**A — SOURCE ACCEPTED.** The G0 successor changes only the body of the resource-refusal branch: the three 1,536 MiB
predicates and the unconditional `AFFECTED_MODE_RESOURCE_FLOOR` throw are byte-identical, the telemetry is built solely
from the resource object that was already measured, it is written fresh with `CreateNew`, a recording failure is
reported explicitly and never swallows the throw, no measurement, retry or ticket reuse is added, and the browser
floor is untouched.

**B — SOURCE ACCEPTED, diagnostic scope only.** The adapter stops before the first `Page.navigate` without issuing
it, delegates every target decision to the unchanged accepted driver, retains the first independently observed
refusal, restores the patched method unconditionally in nested `finally` blocks, bounds drain and private teardown
with finite deadlines, and emits only the doc 109 sanitized records plus counts. Its calls match the pinned CDP class
exactly. Running it needs a separately qualified parent; none exists.

**C — SOURCE ACCEPTED for the profile, with the current parent R2.** Controller, wrapper and parent R2 are the
accepted R3 mechanics adapted to exactly one mode, `verify:release-manifest`, with the alternate index and the three
expected-identity variables confined to the validator child, the default index bound and compared before and after,
inherited index/event variables refused, local refs required, and the manifest, attestation artifact and alternate
index pinned as frozen inputs. Nothing in it is executable yet: three template pins are unbound, the alternate index
is unbuilt, the manifest's `diffCheck` slot is empty, and no admission exists.

Reviewer: this session, `claude-fable-5-1`. Packet
`DOC111_NEXT_SOURCE_PROFILE_REVIEW_READY_20261013/` (board `3d65f29`): `PACKET_INVENTORY.json` 2,514 B
`b4f0ed03…`, `SOURCE_INVENTORY.json` 5,466 B `f85aa627…`; every packet file re-hashed to its inventory row and to the
immutable source blobs it names. Application `8e85daa`/`25507c2f`, build `3dd3d96`, QS-2, QS-R5 and docs 104–111
unchanged. Reviewed directly, read-only, no agents (your instruction; also, subagents would be local processes on the
machine the browser qualification is waiting on), nothing executed. Archive:
`hl12/112_g0_telemetry_diagnostic_adapter_manifest_profile.json`.

## A. G0 refusal telemetry (`76eb5881`, `execute-admitted-static-cli-refusal-observation-proposed-r1.ps1`, 10,033 B `9bcfbc75…`)

- **My diff against the accepted R3 CLI parent `2a72dd9e…`:** one hunk. The line
  `if($qualResource.osFreeMiB -lt 1536 -or $qualResource.availableMiB -lt 1536 -or $qualResource.commitHeadroomMiB -lt 1536){throw 'AFFECTED_MODE_RESOURCE_FLOOR'}`
  becomes the same predicate opening a block that (1) builds an ordered record from the existing `$qualResource`
  object, the three failing-floor booleans, mode/source/tree/admission hash and constants
  `parentInvocations=1; supervisorLaunched=$false; validatorLaunched=$false; automaticRetries=0`; (2) writes it to
  stderr; (3) inside `try`, creates the output directory and opens `refusal.json` with `FileMode.CreateNew` /
  `FileShare.None`, writing UTF-8 bytes and disposing in `finally`; (4) on any failure writes
  `G0_REFUSAL_RECORD_WRITE_FAILED` to stderr; (5) then throws `'AFFECTED_MODE_RESOURCE_FLOOR'` unconditionally.
- **Verified properties.** `Get-CimInstance`/`Win32_` call count is 3 in both files: no new measurement; earlier
  unknown readings stay unknown. The pre-existing `OUTPUT_NOT_FRESH` check (line 38) still precedes the branch, and a
  refused attempt now leaves its directory behind, so a second attempt under the same ticket refuses at that check:
  no retry path. The success path, ticket hash, exact invocation, window, pins, source/history, competing-process,
  last-start, supervisor start, 240 s bound and receipt logic are untouched. The 2,048 MiB browser floor lives in the
  browser scripts, which this delta does not touch.
- **Limits.** The record is produced only on a future legitimately admitted refusal; the two earlier parent refusals
  (`b66f119c`, `da04d290`) remain numerically unknown. The same block appears verbatim in parent R2 (C).

## B. Diagnostic adapter (`143cc684`, `diagnostic-adapter-proposed.mjs`, 6,264 B `f79528ec…`) and design (`ab19e272`)

- **Pre-navigation boundary.** `diagnosticSend` replaces `CdpConnection.prototype.send`; for `Page.navigate` it sets
  `navigationRefused` and rejects with `DIAGNOSTIC_STOP_BEFORE_FIRST_PAGE_NAVIGATION` before calling the original,
  so no HTTP navigation is ever issued; every other method, including the driver's `Target.closeTarget` on a refused
  target, passes to the original. In the accepted driver (`b2f0901d…`) `runFresh()` → `begin('fresh')` creates the
  browser context and an `about:blank` target and enables domains before the first `navigate(route)`, so the
  diagnostic observes exactly the phase in which R2 failed with zero cases.
- **Unchanged guards.** The adapter constructs the driver through its public factory with `clientFiles: []`,
  `adminOverviewExpectedDenialsApproved: false`, a `control` that refuses and a `record` that refuses; it does not
  export or rewrite private driver functions; `onAttachedTarget`, the acceptance predicate, `closeTarget`/`fail`, the
  network fences and the nine assertions are the driver's own and untouched. The driver API it relies on exists:
  `createQlBrowserDriver` returns `{ runFresh, …, evidence, drain, get failure() }`.
- **First-refusal retention.** `firstFailure` is the first thrown code; a drain error replaces it only when the first
  failure was the intentional stop, so an independently observed `UNEXPECTED_BROWSER_TARGET` is never masked.
- **Restoration and teardown.** `finally { try { collect } finally { try { restore send } catch … finally {
  Browser.close via the original send with a bounded timeout; bounded connection.close(); } } }` — restoration runs
  whether or not drain or collection failed, teardown runs whether or not restoration threw, and `sendRestored` is
  recorded by identity comparison. `boundedCleanup` requires `Number.isFinite(remaining) && remaining > 0` and caps
  each step at `min(5000, remaining)` ms; `Browser.close` receives that timeout through the class's own
  `{ timeoutMs }` option.
- **Pinned class fit.** `scripts/evidence/lib/cdp.mjs` at `8e85daa` hashes to the pinned `12a76cec…` and declares
  `send(method, params = {}, sessionId, { timeoutMs } = {})`, `close()` and `this.ws`; the adapter's calls match that
  signature exactly. `chrome.mjs` hashes to the pinned `01f53d2d…`.
- **Evidence.** Only the doc 109 `targetAttachments` records (≤64, sanitized) and the omitted count, plus integer
  counts of cases/screenshots/network events/control calls and error codes filtered through `codeOf`; `bounded`
  requires 64 or fewer records and zero cases, screenshots, network events and control calls; `journeyCredit: false`
  always.
- **Status classification.** `ORIGINAL_TARGET_REFUSAL_OBSERVED_BEFORE_NAVIGATION` only when the driver's own failure
  or the first failure is `UNEXPECTED_BROWSER_TARGET`; `PRE_NAVIGATION_BOUNDARY_REACHED_NO_REFUSAL_OBSERVED` when the
  stop was reached cleanly with no refusal; anything incomplete, unbounded, unrestored or unclosed is
  `DIAGNOSTIC_FAILED_OR_INCOMPLETE`. As the note says, a boundary-only result cannot exclude navigation- or
  application-triggered failure.
- **Limits and parent predicates (all retained, none waived).** `Promise.race` bounds observation, not cancellation;
  the prototype patch is process-global, so the parent must establish sole use of the exact pinned class and a
  verified owned loopback endpoint before the first captured connection, pin the modules and tools
  (`SELECTED_EXISTING_TOOL_DEPENDENCY_PINS`, 40 rows, and the design's fixed tool pins), enforce finite work and
  cleanup bounds, and perform exact-identity two-quiet plus independent process closure. The 2,048 MiB browser floor
  stands. No runner, window, admission or closure evidence exists; this acceptance is of the adapter's source only.

## C. Release-manifest validator profile (`0c29e3bb` raw files; parent R2 from `6d199875`)

- **Bytes.** Controller `run-manifest-cli-proposed-r1.cjs` 45,375 B `e8e47ad1…`; wrapper
  `manifest-primary-wrapper-proposed-r1.cjs` 6,178 B `d6f7b0d6…`; parent R2
  `execute-admitted-manifest-proposed-r2.ps1` 11,210 B `06d4fb93…` (the r1 parent `4dad7cb9…` is superseded and
  not reviewed for use); `pins-manifest-proposed-r1.TEMPLATE.json` 18,742 B `2d1b563c…`. The three supplied comparison
  patches are against the accepted R3 controller `55b7ff04…`, wrapper `e3898fe7…` and CLI parent `2a72dd9e…`; my own
  diffs of the wrapper and parent agree with them, and I read the controller patch in full.
- **Controller delta (vs R3).** Single mode `release-manifest`; `GIT_INDEX_FILE` and `GITHUB_EVENT_PATH` added to the
  inherited-variable refusal; runner and pins must live in the profile directory; 95 pins, the three new required ones
  being the external manifest, the attestation artifact and the alternate index, all verified before start and after
  close; `verify:release-manifest` must map to `tsx scripts/acceptance/verify-release-manifest.ts` with no pre/post
  hooks; the manifest, artifact and alternate index must be physical files and `manifest-review.index.lock` must not
  exist; `GIT_OPTIONAL_LOCKS=0` in the child environment; `sourceState()` refuses to run under an index overlay,
  resolves the default index path with read-only git, requires no `index.lock`, records the default index's path and
  digest, and `sourceMatches()` now requires that digest unchanged after the run; the base and head commits must
  resolve locally so the validator's fetch fallback is never reached; `cliArgs` is
  `[npm-cli.js, "run", "verify:release-manifest", "--", <manifest>]` and the result comparator is the strict array
  equality accepted in doc 108. Everything else — handshake, ACK, identity, budgets 180/60/240, heap 1,024 MiB,
  cleanup — is byte-identical to R3.
- **Wrapper delta (vs `e3898fe7…`).** Same gate; one mode; `commandFor` returns
  `[NODE, NPM, "run", "verify:release-manifest", "--", MANIFEST]` with the same forward-slash literals and the same
  `SCRATCH`/manifest path as the controller, so the strict comparison matches; the wrapper refuses an inherited
  `GIT_INDEX_FILE`; the child is spawned with `GIT_INDEX_FILE`, `XENIOS_EXPECTED_PRODUCTION_SHA` (`79414143`),
  `XENIOS_EXPECTED_HEAD_SHA` (`8e85daa`) and `XENIOS_EXPECTED_OWNERSHIP_SHA256` (`bb4ea1f7…`) added only to its
  environment; output directory `validator-r1`.
- **Parent R2 delta (vs `2a72dd9e…`).** Mode set `release-manifest`; inherited `GIT_INDEX_FILE`/`GITHUB_EVENT_PATH`
  refused; profile roots and ticket path; the pins hash is taken from the ticket's frozen-input row for the pins file
  (the ticket itself is hash-bound by `$AdmissionSha256`); exactly one frozen-input row for the canonical default index
  path with positive byte length and digest is required, and the actual index path resolved by read-only git must equal
  it; `--no-optional-locks` on the dirty check; the competing-process pattern covers the new scratch roots; the same
  refusal telemetry as A; supervisor receipt path. `Get-QualPin` therefore asserts the default index is byte-identical
  before and after the run, independently of the controller's own pre/post comparison.
- **Index overlay semantics.** The overlay exists only in the validator child; the supervisor, wrapper and all source
  and default-index probes run without it; the validator reads the attestation artifact with `git show :<path>` from the
  alternate index. The unexecuted proof specifies the alternate index as the full `8e85daa` tree plus exactly one
  stage-0 mode-`100644` entry at
  `docs/health-launch/ql-build-20261012/release-manifest-8e85daa/integration-ownership-review.json`. For the owners'
  exact-entry check: `git hash-object --no-filters` over the genuine 1,027-byte artifact (`20a03bb6…`) is
  **`6c0a4113a2a48e188dbafd794aa733c6cb32ba9a`**, the same blob my records committed; the entry must carry that id, and
  `git ls-files -s` under the overlay must differ from `git ls-tree -r 8e85daa` by that one row only. The overlay is
  intentionally not equal to HEAD and no clean-index claim is made or needed.
- **Partial manifest and bindings.** `release-manifest-8e85daa.PARTIAL.json` (7,470 B): schema 2, lane
  `existing-request-intake-release`, owner the Core session, base/head/currentProduction as expected, 17 files, the
  `integrationOwnershipReview` block equal to my attestation with `reviewArtifactSha256` `20a03bb6…`, test slots
  `focused` (reuse of `dd3f532` 91/91, doc 105), `fullSuite` (reuse of R5, doc 105), `typecheck` (actual
  `check:release-control-plane` at `8e85daa`, doc 108), `build` (reuse of the `3dd3d96` literal render-build, doc 104),
  `diffCheck` null; six evidence rows citing my records. `RECEIPT_SOURCE_BINDINGS.json` partitions the suite exactly as
  my dispositions do: 18,005 historical passes plus 84 authored skips at `dd3f532` after removing the three affected
  files, 62 passes plus one authored skip at `8e85daa`, 36 companion passes at `3dd3d96`. That is a faithful,
  source-bound test assembly, not a new whole run, and it is still unvalidated.
- **Not yet executable (owed, not corrections).** Three unbound template pins (final manifest bytes, the placed
  attestation artifact, the built alternate index); the real `pins-manifest-proposed-r1.json` and its whole-file hash
  in the ticket; the default-index row's live value at admission (the preparation-time observation `630,285 B`
  `02415548…` is theirs to re-bind; I cannot see that index); the `diffCheck` receipt; the finite ticket and fresh G0
  under the 1,536 MiB floor; then one attempt with zero retries. The 15/36 control acceptances cover the shared R3
  mechanics, not this profile's command, overlay or default-index branches; the strict comparator for the new command
  is verified by inspection here, and only the actual run binds it.
- **Named limits.** A racy stat refresh of either index by a git invocation would change bytes and fail the post-pin
  or post-source checks closed, never open; `GIT_OPTIONAL_LOCKS=0` and `--no-optional-locks` are the mitigations. The
  validator's own 7-day windows (evidence age; my attestation valid to 2026-10-20T20:31Z; production-state evidence
  to 2026-10-20T13:49:12Z) apply at run time. The manifest lane is not a policy lane and must not change, or the
  attestation becomes invalid (doc 110).

## D. Dispositions in one line each

- **A:** SOURCE ACCEPTED. No correction. Execution needs a new finite ticket binding `9bcfbc75…`; no reuse of refused
  tickets.
- **B:** SOURCE ACCEPTED as a diagnostic adapter. No correction. Executable only under a parent that proves sole
  pinned-class use, owned endpoint, module/tool pins, finite bounds and exact-identity closure; no window exists; no
  journey credit can follow.
- **C:** SOURCE ACCEPTED for the manifest profile with parent R2 (`06d4fb93…`), controller `e8e47ad1…`, wrapper
  `d6f7b0d6…`. No correction. Not admissible until the owed artifacts above exist and are pinned; expected artifact
  blob `6c0a4113…`.

Application acceptance, prior receipts, the operating attestation and the QS-R5 direction are closed and unchanged.
Nothing here is an admission, a release qualification, a push or a deployment. Nothing was executed.
