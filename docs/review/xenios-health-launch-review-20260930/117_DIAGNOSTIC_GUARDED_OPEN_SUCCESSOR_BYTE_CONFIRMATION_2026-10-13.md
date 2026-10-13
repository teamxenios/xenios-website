# Revision 17 B: diagnostic runner/parent successor with positive guarded-open predicates, byte confirmation

**CONFIRMED.** The successor at Core `0b601547` (tree `415170a8`) carries exactly the doc 116 §1 correction and
nothing else. The parent `execute-admitted-target-lifecycle-diagnostic-proposed.ps1` (12,575 B `1b82d025…`) and the
runner `run-target-lifecycle-diagnostic-proposed.cjs` (32,526 B `4770729a…`) each contain one inserted predicate
string, present once and absent from the doc 116-reviewed files; removing that single string from each file restores
the reviewed bytes byte for byte (`7fb7af42…` and `2a4da635…`). The pins file (13,831 B `9aa9e916…`) changes only the
two self rows, length and hash, with paths unchanged; the other 53 rows and every top-level key are identical. The
guard, the historical `PROPOSAL.json` and the accepted driver and adapter rows are unchanged. The doc 116 acceptance of
the mechanics now applies to this successor, with the proof gap closed in source.

Reviewer: this session, `claude-fable-5-1`, revision 17, item B only (the controls successor `d7c64c55` is not
submitted and is not reviewed here). Read-only, no agents, nothing parsed, imported, executed or probed; no browser,
profile, socket, HTTP, index or SQL. Application `8e85daa`/`25507c2f`, tooling `3dd3d96`/`7a4ce7c3`, docs 104–116 and
all accepted receipts unchanged. Archive: `hl12/117_diagnostic_guarded_open_successor_byte_confirmation.json`.

**Where the bytes are.** Core `0b601547`, canonical path
`doc104-baseline-reconciliation-20261013/target-lifecycle-diagnostic-runner-source-proposal/`: parent blob
`459a3878`, runner blob `27758fa4`, pins blob `296a8c3a`; governing metadata under
`doc116-open-guard-successor/`: `SOURCE_SUCCESSOR.json` 6,518 B `c6ad9fe2…`, `MECHANICAL_DIFF.patch` 6,380 B
`b073cbc7…`. Root packet `DOC116_REVISION17_NARROW_SUCCESSORS_REVIEW_READY_20261013/diagnostic/` and
`diagnostic-successor/`: every file byte-identical to the Core blob its `ROOT_RAW_INDEX.json` names;
`ROOT_MECHANICAL_BYTE_PROOF.json` states the same restoration facts I reproduced. The records worktree
`C:/xenios-wt/tc25-app-manifest-20261012` (now at `2876254`) holds the three successor files at the pinned paths with
the pinned digests, so the two self rows resolve.

## 1. The two inserted strings

- **Runner, line 345**, inside the `ok` conjunction after `receipt.postPinsMatched` and before the original
  `receipt.openGuard?.restored===true&&receipt.sendRestored===true&&!activeProbes.size&&anchors.every(a=>a.closed)`:
  `&&receipt.openGuard?.attempts===1&&receipt.openGuard?.delegated===true&&receipt.openGuard?.instanceCaptured===true`
  (114 bytes; file delta 114).
- **Parent, line 130**, inside the status conjunction after `$qualResult.postPinsMatched -eq $true` and before the
  original `-and $qualResult.openGuard.restored -eq $true -and $qualResult.sendRestored -eq $true …`:
  ` -and $qualResult.openGuard.attempts -eq 1 -and $qualResult.openGuard.delegated -eq $true -and
  $qualResult.openGuard.instanceCaptured -eq $true` (143 bytes; file delta 143).
- Every pre-existing condition remains in both expressions: exit 0, actual lifetime ≤ 180,000 ms, runner status
  `DIAGNOSTIC_PRELIMINARY_REQUIRES_OUTER_TIMING_AND_INDEPENDENT_CLOSURE`, `cleanupConfirmed`, `postPinsMatched`,
  `openGuard.restored`, `sendRestored`, `journeyCredit false`, two quiets, no `terminal-failure.json` (parent); no
  fatal, primary settled, observed diagnostic status, cleanup confirmed, post pins matched, restored, send restored, no
  active probes, all anchors closed (runner). The facts come from the guard's own frozen `facts` getter
  (`attempts`, `delegated`, `restored`, `instanceCaptured`), which the runner copies into `receipt.openGuard` in
  `finish`'s `finally` after restoration, so they are reported even on failure paths and a null guard fails both
  predicates.
- No CR bytes in either file; the runner's `TOOL_ROOT` literal and its hard-coded digests for `cdp.mjs` `12a76cec…`,
  driver `b2f0901d…` and adapter `f79528ec…` are unchanged.

## 2. Effect

With these predicates, a diagnostic status is reachable only if exactly one `open()` was invoked on the guarded
prototype, captured and delegated after revalidation. That proves the driver's `CdpConnection` is the same class the
runner patched, hence the adapter's `send` interception covered every `Page.navigate` the driver could issue, and the
"before navigation" claim of either diagnostic status is truthful. Nothing accepted in doc 116 is reopened: same
class and driver import path, the nineteen Chromium arguments, the adapter, the native optional branch, the bounds
(120 s + 60 s / 180 s, 256 MiB heap, 2,048 MiB floor), `journeyCredit = false`, and the privacy scope under which
Chromium's own `DevToolsActivePort` stays solely in the private retained profile with no archive, export, copy or
deletion.

## 3. Retained execution prerequisites (unchanged from doc 116)

Separately applicable source and runtime authority; an exact finite Root ticket binding the whole pin file plus the
55 raw inputs (56 frozen inputs including the parent itself), Core owner, unchanged `8e85daa`/`25507c2f` and
`3dd3d96`/`7a4ce7c3`, the metadata policy string, fresh `run-r1` and `parent-r1`; fresh 2,048 MiB OS/available/commit
floors and an exclusive job with no competing admitted group; raw two-root identity and pins before and after; a
launch chain that does not self-match the competing-process regex; actual outer start/end/exit and lifetime, post
pins, exact owned closure with two quiets, and an independent exact-identity closure after exit. No actual
diagnostic, profile, socket or browser exists from this source, and no nine-case journey credit follows a diagnostic
result.
