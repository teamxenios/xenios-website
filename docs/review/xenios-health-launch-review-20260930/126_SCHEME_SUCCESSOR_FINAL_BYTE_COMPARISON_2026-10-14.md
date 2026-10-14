# Revision 23 A: scheme-enum diagnostic successor, final byte comparison

**CONFIRMED.** At Core `2dc4ec4e` (tree `806e93e9`), canonical namespace `target-scheme-diagnostic-source-proposal/`:
the driver (41,303 B `5c90b077…`) is byte-identical to the doc 121 projection, which I recomputed from the accepted
doc 109 driver and the accepted one-hunk patch; the runner (32,599 B `1f9f1f38…`) differs from the accepted doc 117
runner (`4770729a…`) at exactly four lines, all literals: line 11 `PROFILE` to the scheme namespace, line 12
`SCRATCH` to `ql-doc121-target-scheme-diagnostic-20261014`, line 22 `DRIVER` to the new driver's records path, and
line 388 the hard-coded driver digest from `b2f0901d…` to `5c90b077…`; the parent (12,562 B `3c7c7b9d…`) differs
from the accepted doc 117 parent (`1b82d025…`) at exactly two lines, `$qualProfile` (line 8) and `$qualScratch`
(line 9); the guard (2,290 B `7aa38c2d…`) is byte-identical to the accepted guard; the pin file (13,904 B
`fb993eb2…`) has 55 rows of which 51 are unchanged, the first 40 dependency rows byte-equal in JSON including property
order, and rows 48, 51, 52 and 53 (driver, guard, parent, runner) are relocated to the new namespace with sizes and
hashes that match the packet files; its only other change is the status label. The old doc 117 inputs, the doc 120
archive, the private profile and the doc 109 driver are untouched; the fresh scratch, outputs and profile do not
exist. The acceptance predicates are unchanged: 56 exact inputs including the pin file, current finite authority and
window, exclusive slot and fresh 2,048 MiB floors, guard attempts 1 / delegated / instance captured / restored, send
restored, true external timing, independent closure, zero application navigation and zero journey credit.

Reviewer: this session, `claude-fable-5-1`, revision 23 item A, queued after revision 22. Read-only; computed as
text; nothing parsed, imported or executed. Docs 120–125 closed; application `8e85daa`/`25507c2f` and tooling
`3dd3d96`/`7a4ce7c3` unchanged. Archive: `hl12/126_scheme_successor_final_byte_comparison.json`.

**Where the bytes are.** Root `DOC121_REVISION23_SCHEME_ASSEMBLY_REVIEW_READY_20261014/`: eight files, each
byte-identical to the Core blob its `ROOT_RAW_INDEX.json` names: the four sources above, the guard, the pin file,
`ASSEMBLED_SOURCE_HANDOFF.json` 7,187 B `f74028a4…` and `scheme-enum-synthetic-source.test.cjs` 8,050 B `ad9b6548…`
(doc 127). The handoff's byte metadata (new and donor hashes) agrees with what I measured.

## 1. What else the four runner literals imply

Everything the runner derives from `PROFILE` moves with it: `OPEN_GUARD`, `PARENT`, `PIN_FILE` and `__filename` now
resolve to the scheme namespace, and the pin rows 51–53 carry exactly those paths, so the 55-row required set (40
dependency rows plus Node, Chromium, PowerShell 5, Git, the two helpers, `chrome.mjs`, `cdp.mjs`, driver, adapter,
dependency rows, guard, parent, runner and pwsh) is still exact. `OUTPUT` follows `SCRATCH` to `…/run-r1`; the parent's
`$qualOut` follows `$qualScratch` to `…/parent-r1`, and both still demand their outputs absent. `TOOL_ROOT`,
`RELEASE_ROOT`, `RECORDS`, `ADAPTER`, `DEP_ROWS`, the adapter and CDP digests, the 19 Chromium arguments, the native
resolution checks, the guard installation and the positive guarded-open predicates are the doc 117 text. The driver
digest the runner enforces is now the enum driver's, and the pin row 48 agrees. The ticket path constant in both
runner and parent is unchanged, so the future ticket must be issued at that same path with a new hash; the consumed
`db599667…` ticket bytes are preserved in the doc 120 archive and cannot bind this successor.

## 2. Owed before any run (unchanged in substance)

Doc 127's canary proving under its own test admission; a fresh finite diagnostic ticket binding the 55 rows plus the
pin file (56 inputs), the unchanged candidate and tooling roots, the metadata policy, the literal invocation, the fresh
outputs and an explicit scope; a fresh 2,048 MiB three-way admission and exclusive slot; zero application navigation
and journey credit; actual outer exit timing and an independent closure; no private profile or `DevToolsActivePort`
export; and no relaxation of source, guard or arguments from whatever scheme class the run reports. Scheme classes are
not ownership, actual origin, cause, benignity or journey proof.
