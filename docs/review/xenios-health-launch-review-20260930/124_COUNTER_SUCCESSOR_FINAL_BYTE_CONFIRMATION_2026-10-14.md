# Revision 22 A: counter-read controls successor, final byte confirmation

**CONFIRMED.** The assembled parent at Core `adce58de` (tree `1cdaf950`), canonical namespace
`finalization-controls-counter-source-proposal/`, is 19,072 B `fc6ea41b…` and equals the doc 123 projection
(19,074 B `e605b2dc…`) with exactly two literal changes: line 4 `$fRoot` from the identity namespace to the counter
namespace, and line 8 `$fOut` from `attempt-identity-r1` to `attempt-counter-r1`. Reversing those two literals
reproduces the projection byte for byte; no other line differs (236 lines each, no CR bytes); the optional final-exit
age condition from doc 123 §3 is not present, as stated. The three finalization fixtures differ from the accepted 60f
fixtures only at their lines 13–14, the two output literals, with no `attempt-identity-r1` text remaining; both R3
slices are byte-identical to the accepted ones; the eight-row pin file (3,087 B `647ff6b6…`) keeps the R3 parent and
pinned pwsh rows unchanged and relocates the six source rows to the counter namespace with hashes that match the
packet files. The old identity-namespace inputs and every consumed ticket are untouched. No output exists. This is a
byte confirmation; it is not execution consent, and the doc 123 acceptance predicate stands: real parent lifetime
strictly below 30,000 ms by independent OS observation, exit 0, all three children exit 1 with their exact evidence,
post pins unchanged and an independent closure, with 512 MiB floors, 20 s work and 10 s finalization ceilings, 5 s
child, 16 KiB caps, one attempt, zero retries, zero stops and the real Git diff census limit unchanged.

Reviewer: this session, `claude-fable-5-1`, revision 22 item A. Read-only; computed as text; nothing parsed or
executed. Docs 117–123 closed; application `8e85daa`/`25507c2f` and tooling `3dd3d96`/`7a4ce7c3` unchanged.
Archive: `hl12/124_counter_successor_final_byte_confirmation.json`.

**Where the bytes are.** Root `DOC123_REVISION22_COUNTER_ASSEMBLY_REVIEW_READY_20261014/`: 11 files, each
byte-identical to the Core blob its `ROOT_RAW_INDEX.json` names: parent `fc6ea41b…`; `late-second-quiet.ps1` 8,245 B
`ae93d88e…`; `late-receipt-write.ps1` 8,246 B `dbd87494…`; `write-failure.ps1` 8,241 B `3bc3bf43…`;
`r3-finalization.slice.ps1.txt` 3,762 B `7c685cef…`; `r3-write-functions.slice.ps1.txt` 403 B `9587eb57…`;
`PINNED_INPUTS_SOURCE_ONLY.json` `647ff6b6…`; `ASSEMBLED_SOURCE_HANDOFF.json` 7,980 B `db85224c…`;
`SYNTHETIC_PROVING_SOURCE_REQUIREMENTS.json` 3,901 B `e99e0b3c…`; `ROOT_STATIC_BYTE_PROOF.json` 370 B;
`counter-synthetic-case.ps1` 7,237 B `c43d4b22…` (reviewed in doc 125). The records worktree
`C:/xenios-wt/tc25-app-manifest-20261012` (at `c0beeca`) holds the parent, fixture and pins at the pinned paths with
the pinned digests. `ROOT_STATIC_BYTE_PROOF.json` states the same reversal and slice facts I reproduced.

## 1. Parent

Base: accepted 60f parent 17,188 B `31674d82…`. Doc 123 hunk: lines 62–66 → 28 lines, projection 19,074 B
`e605b2dc…`. Final: the projection with `$fRoot` →
`…/doc104-baseline-reconciliation-20261013/finalization-controls-counter-source-proposal` and `$fOut` →
`C:/Users/sboad/.codex/tmp/ql-doc114-finalization-controls-20261013/attempt-counter-r1`; each new literal occurs once
and each old literal zero times. The counter block (final lines 62–89) is the doc 123 hunk unchanged: OS query at one
second, Stopwatch and single parent-age sample, strictly-more-than-two-seconds pre-query gate, one
`Win32_PerfFormattedData_PerfOS_Memory` read with `-OperationTimeoutSec 2`, late-return refusal, exactly-one-row and
field shape checks, four numeric timing fields, non-finite derived refusal, the byte-identical three 512 MiB
comparisons, and the post-validation envelope check. Everything after it, including the ticket binding, eight-input
set, identity loop, case assertions, finalization deadline and exit line, is the 60f text.

## 2. Fixtures, slices, pins

- Each fixture: line 13 `$dOut` prefix and line 14 `$cTicket.output` literal now name `attempt-counter-r1`; the
  simulated clock, census, writers and the embedded R3 finalization slice are the doc 115/118 bytes.
- Slices identical to the accepted ones (`7c685cef…`, `9587eb57…`).
- Pins: row 0 R3 parent `b98f7a25…` 19,110 B and row 1 pwsh `362a356c…` 301,368 B unchanged; rows 2–7 relocated with
  the measured hashes above and the parent row 19,072 B `fc6ea41b…`; `r3Sha256` `b98f7a25…`. The pin file itself must
  be the ninth frozen input of the future ticket, as the handoff says.

## 3. What this confirmation does not do

It admits nothing. Still owed before any run: a new finite ticket (mode `doc114-finalization-controls`, output
`attempt-counter-r1`, `pinsSha256` `647ff6b6…`, nine frozen inputs, unchanged bounds, real issuance window with
`lastStart = ends − 45 s`, UTF-8 without BOM, and an explicit statement that the counter sub-operation uses a
two-second timeout); the applicable human-scope check; a fresh positive 512 MiB reading inside the admitted run; an
exclusive slot; an external observer recording parent creation, exit and lifetime; the counter synthetic proving under
its own authority (doc 125); and the independent closure. Consumed tickets stay consumed; prior failures stay
separate; no floor or governor is waived.
