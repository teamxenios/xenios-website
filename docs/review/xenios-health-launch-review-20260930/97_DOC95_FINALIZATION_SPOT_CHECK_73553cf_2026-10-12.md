# Doc 95 finalization (`bfeb36f` → `7ac4e4d` → `73553cf`): three-diff spot-check

**ALL THREE DIFFS MATCH THE ENVELOPE. The currentness receipt is FINAL, the intake's currentness dependency seal is
FINAL, and the intake source seal is set. The composition review series (docs 83 to 95) is closed.**

Nothing was executed. Finalized records are evidence of accepted bytes, not of an executed transaction, an installed
configuration or readiness to activate.

Reviewer: this session, `claude-fable-5-1`. Board task `QUICK-ORDER-DOC95-FINALIZATION-SPOT-CHECK-20261012` revision 1
(registered 2026-10-12T17:49:36Z; review owner this session). Governing review: doc 95 (`d4e6a50`), envelope from doc 94
section 3. Verified read-only from Git; the board registration's identities match Git in every field.

**Method.** I parsed each finalized receipt and compared it leaf by leaf with its envelope base, recomputed blob IDs and
raw SHA-256 from the Git objects, and checked chain scope with `git diff --name-only`. No workflow was used. The
computations are archived as `hl12/97_doc95_finalization_spot_check.json`.

## 1. The three steps

| Step | Commit | File, blob, size | Changed leaves | Frozen (confirmed) | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | `bfeb36fcd70b3fc5615bd9977e20966f8932b834` | currentness receipt, `8c058c4c`, 186,264 B, raw `8dfbd075…` | exactly `sourceAcceptance.status` → `SOURCE_ACCEPT_WITH_LIMITS` and `sourceAcceptance.reviewCommit` → `29ccf647…`; one new key `disclosures.doc95Finalization` | all 102 pins; header `54ffba10`/`45531814`; both definitions `8b631a83`; the 11 top-level keys; the `sourceAcceptance` key set; every pre-existing `disclosures` key and value; `currentnessDependency` null; 75,880 B of headroom | **MATCH** |
| 2 | `7ac4e4d3d4bd7b780044aaccf2863ce25129a568` | intake receipt, `e3c18dc1`, 196,825 B, raw `886e3ed1…` | exactly the nine ruled leaves: `currentnessDependency.{status, reviewCommit, sealStatus}` and `.receipt.{commit, recordsCommit, gitBlob, rawSha256, sha256lf, bytes}`, bound to the step 1 blob | all 102 pins; `currentnessDependency.{sourceCommit, sourceTree, definitionSha256}`; intake `sourceAcceptance` still PENDING at this step | **MATCH** |
| 3 | `73553cfc7efd2714643933cae05029b2d5d1ad66` | intake receipt, `6021c556`, 196,881 B, raw `0e606fd1…` | exactly `sourceAcceptance.status` → `SOURCE_ACCEPT_WITH_LIMITS` and `sourceAcceptance.reviewCommit` → `d4e6a50dc11b3e91d2241dde63be4d33a287fb67` | all 102 pins; the currentness receipt unchanged from step 1 | **MATCH** |

**The one new key** (`doc95Finalization`) cites doc 82 for the acceptance; docs 87, 94 and 95 (`d4e6a50`) for the
binding confirmation; declares the embedded PENDING/NON_FINAL narrative superseded; names the archived-narrative map
identity (`dacc90c`, blob `d01de5e2`, raw `8d6cb3c7…`, 1,538,019 B) as R5C-6 required; and carries the R5C-1 and R5C-2
precision statements. It claims no execution, installation or readiness.

**Chain scope.** `2d15b99..73553cfc` changes only the two receipts, the `.xenios` registries and one handoff.
`25741f0..73553cfc` changes no code path. The accepted source is untouched.

## 2. TC-25 manifest amendment: not yet applied

The board records `TC25_EXACT_APP_MANIFEST_AMENDMENT_DECISION_20261012.json` with status
`UNAPPLIED_ACTUAL_FOUNDER_RECORDS_AUTHORITY_REQUIRED`: a prepared candidate changing only
`seamBaselineHashes.files["client/src/App.tsx"]` from `sha256:3b3b808b…` to `sha256:1ee2d576…`, with the hub line and
the disabled Quick Order change both named in scope. The manifest on every branch still carries `3b3b808b…`. When the
applied successor is registered I check that exact scope: one hash, one file, no source, test or other baseline change.

**Erratum to my reconciliation at `582c763`.** `App.tsx` is pinned under `seamBaselineHashes.files` (manifest from
line 716), and the governing check is `server/core-site-protection.test.ts:385-388` ("verifies the seam baselines
too"), not the generic `fileHashes` tripwire at `:320-323` that I cited. The consequence is unchanged: the line fails
that test until the seam baseline is amended.

## 3. QL-11 / QL-12 successor: nothing registered yet

The board holds the seven-path ownership boundary, the Fable lead start record and the directives; no correction
successor exists. Doc 96's Lite verdict stands until a specific accepted successor supersedes it. When a successor is
registered I review its bounded diff (ambiguous-outcome recovery, persisted attempt identity and `acceptedAt`, conflict
handling, authorization, and the canonical payment-verification boundary) and treat submitted test evidence as evidence,
not as something I ran.

Nothing here authorizes tests, SQL, installation, a push of owner payloads, integration or deployment.
