# KAN-31 finalizer provenance correction: changed bytes only

**PASS, source only. The Doc 193 finding is resolved, and no new material defect was found.**

- **Overall verdict.** With this correction, the KAN-31 browser apparatus (`674f4ade`, as corrected by `51962b33`) is
  PASS at source scope. Doc 193's non-blocking notes in section 4 stand.
- **Execution.** Nothing here grants execution. Every runtime prerequisite in Doc 194 is unchanged.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No import, parser, controls run, SQL, browser, resource or provider action; no agents. Only the Doc 193
finding and these bytes were reviewed.
- **Packet.** Delivered in chat.
- **Timing.** Reviewed at 2026-10-15T21:39–21:43Z.
- **Jira.** Root relays.

Archive: `hl12/195_kan31_finalizer_provenance_correction.json`.

## 1. Identity

- **Commit.** Core `51962b33` (tree `32bf0012`, parent `770eb7a6`, local only).
- **The six changed paths in the proposal directory.**

| File | Size | Hash | Change |
|---|---|---|---|
| `finalize-managed-evidence.UNAPPLIED.mjs` | 12,461 B | `97ea7529…` | modified |
| `finalizer-provenance-controls.UNAPPLIED.mjs` | 7,786 B | `c2628ebf…` | new |
| `DOC193_FINALIZER_PROVENANCE_CORRECTION_UNAPPLIED.md` | 7,632 B | `25127e87…` | new |
| `IDENTITY_MANIFEST.json` | 13,658 B | `f5bbafe3…` | modified |
| `INDEPENDENT_READBACK_INPUT_CONTRACT.json` | — | `b81601f5…` | modified |
| `COMPLETE_UNAPPLIED_SOURCE_REVIEW_PACKET.md` | — | `51978085…` | modified |

- **Outside the directory.** Only the parent's separate input-mechanism record.
- **Manifest.** All 22 artifacts match by bytes and SHA-256.
- **Unchanged.** The driver (`d98dab35`), launcher, supervisor, G0, harness, adapter, guard, policy and rules are
  unchanged. As Doc 194 established, nothing pins the finalizer, so there is no cascade.

## 2. The finding, point by point

| Doc 193 required | Corrected finalizer |
|---|---|
| Pin the executed tool arguments | `executedToolArgumentsPin` is read by pin. Its keys must be exactly `project_id,query`, with `project_id === 'tetynodzrtmdbuzgboro'` |
| Query must equal the Doc399 template rendered from the bindings | The template is pinned and must be 5,782 B, `d5814a37…`. I confirmed it has exactly one `__BINDINGS_UTF8_HEX__` (inside `decode(...,'hex')`) and two `__BINDINGS_SHA256__`. The expected UTF-8 is `replace(hex of bindingRaw)` then `replaceAll(sha256(bindingRaw))`, compared byte for byte with `args.query` |
| Pin Root's postcheck approval and admission; single consumption | Pinned approval, admission and consumption records with fixed schemas and Root's coordinator thread |
| (same) | All three carry candidate, tree, run, project, template, bindings, query hash and bytes, and one ticket UUID |
| (same) | `oneAttempt` and 0 retries; an exclusive window; `CONSUMED_ONCE_COMPLETE`, `attempts === 1` and a `toolCallId` |
| (same) | Chain pins: admission to approval, consumption to approval and admission, and all three to the tool-arguments pin |
| (same) | The consumption record pins the native result. Approval and admission pin the bindings, template, outer and browser evidence |
| (same) | Window ordering: approved ≤ admitted ≤ invoked; `notBefore` ≤ invoked ≤ `latestStart`; returned ≤ `returnBy`; recorded ≥ returned; browser cleanup ended ≤ invoked; approval and admission windows equal; exact ISO timestamps |
| Human approval | `actualHumanApprovalRecordPin` must equal the approval's `humanApprovalRecordPin`, with a matching SHA, a nonempty reference and `mode === 'EXACT_POPULATED_DOC399_QUERY'`. No bounded-template authority is accepted |
| Replace `() => true` | The callback now requires the provenance-validated native-result SHA and the compact-bindings SHA, and runs after provenance validation |
| Finalizer and driver identity | `main` requires the finalizer's own pinned path to equal `import.meta.url`, and the driver pin path plus `d98dab35…`. Root binds the finalizer's reviewed hash in the external admission |

- **Fields read from the outer receipt.** `runId`, `endedAt` (`toISOString`), `anchors[].closed`, `activeProbeCount`
  and `fixtureBinding` all exist in the unchanged supervisor.
- **`fixtureBinding`.** Matched by path, bytes and SHA; extra fields are ignored.

## 3. Offline controls: source only, not run

I traced all nine statically, as written:
- **The positive case.** It satisfies every gate.
- **The eight refusals.** Each reaches its intended code first. Mutated records are re-pinned with their dependent
  links refreshed, and the native result is unchanged.
  - A one-byte query change; `BEGIN READ ONLY;` occurs exactly once in the template, so the mutation is real.
  - The wrong project (the production reference).
  - Admission or approval query-hash mismatch.
  - A different consumed ticket.
  - Two attempts.
  - Late return.
  - An empty human reference.
- **Optional further refusals, non-blocking.** An extra tool-argument key, a mismatched human-record pin, a broken
  authority-chain pin, a mismatched evidence pin.
- **Reliance.** The controls must actually be run, with the receipt pinned, before anyone relies on them.

## 4. Limits

1. **Records are trusted.** Hash consistency authenticates no human or provider. The finalizer cannot verify the
   human record's content, such as whether it names this exact query hash. Root must anchor the actual human, approval,
   admission and consumption records. My independent final-result review will read them.
2. **Same file twice.** The approved tool-arguments file and the executed capture are the same pinned file. Root's
   consumption record (`toolCallId`) attests the actual execution.
3. **Lowercase hex.** Rendering must use lowercase hex, which `Buffer.toString('hex')` produces; any other rendering
   is refused.

## 5. What can proceed

Unchanged from Doc 194. Nothing is executable now. Still required:
- a verified secure input mechanism and local launch custodian (Doc 403; Core `770eb7a`);
- executed guard companion and finalizer controls, and syntax and offline checks;
- source7 custody and pins;
- the exceptions;
- Root's grant and a fresh G0 of at least 2,048 MiB;
- Samuel's approval of the staging effects;
- separate Doc399 exact-populated-query authority;
- my final-result review.

This correction gates only the final PASS. Staff, security, payment, phase A, the manifest and live verification stay
OPEN. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Core 51962b33 / tree 32bf0012 (finalizer provenance correction to 674f4ade) | reviewer 6abf1edf | PASS (source only): doc 193 finding resolved — finalizer now pins executed {project_id,query} (project tetynodzrtmdbuzgboro, query byte-equal to Doc399 d5814a37 rendered hex once/SHA twice), human approval record, Root approval/admission/single consumption with ticket/query/window/evidence cross-binding; no-op callback replaced; finalizer+driver self-pins. Nine offline controls traced, NOT RUN. Browser apparatus (674f4ade+51962b33) PASS at source scope with doc 193 §4 notes | execution still blocked per doc 194 (secure input mechanism/custodian, controls, source7, exceptions, grant, 2048 MiB, staging-effects + Doc399 approvals) | doc 195.`

Not execution, admission, approval, push, deployment or production consent; not human approval; not test credit.
