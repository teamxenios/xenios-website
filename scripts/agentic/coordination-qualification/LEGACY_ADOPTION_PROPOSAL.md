# Lossless legacy adoption proposal — offline only

Task: `FACTORY-LEGACY-ADOPTION-PROPOSAL-20261119`.
Owner: `codex-factory-coordination-repro-20261118`, covered by the existing
`FACTORY-COORDINATION-REPRO-20261118` qualification namespace lease.

This is a pure supplied-snapshot classifier and review-packet generator. It is
**not** a migration, bootstrap, registry, journal repair, acceptance operation,
canonical writer, controller adapter or adoption permission. Even a completely
compatible input returns `adoptable: false` and allocates no IDs or authority.

## Inputs and outputs

`prepareLegacyAdoptionProposal({ files, sources, expectedPreimageSha256,
expectedSourceSha256 })` takes in-memory entries `{ path, bytes: Buffer }`.
Paths are metadata and are never followed. The caller captures the snapshot;
this module does not inspect a filesystem or establish a consistent live read.

`sources` contains:

- `qualifiedCommit`: the qualified `57d420613925cfc582827045019f22ec4949bcac`
  contract identity.
- `implementationCommit`: the caller's full 40-hex implementation commit claim.
- `files`: actual supplied source bytes, including this implementation and the
  frozen `corpus-store.mjs` and `path-overlap.mjs` contracts. Their normalized LF
  SHA256 pins are checked. Raw bytes and hashes remain separately bound.

The caller supplies independently captured expected snapshot and source-manifest
digests. `describeSnapshot()` and `describeSources()` provide the deterministic
manifest format; deriving expectations from a newly changed input does not prove
freshness. Source receipts do not prove that supplied implementation bytes are
the module currently loaded, or that a declared commit exists or was reviewed.
The existing Root source/hash review and capture custody must establish that.
`gitAndLoadedCodeProvenanceVerified` therefore remains false.

The result has three separate parts:

1. `proposal`: deterministic manifests, finite findings and source pointers.
2. `proposalSha256`: SHA256 of the canonical proposal object.
3. `retainedSnapshot` and `retainedSources`: independent exact Buffer copies of
   **every** supplied entry, sorted without normalizing the original path or
   content. Duplicate/aliased entries retain their multiplicity and bytes.

Retained bundles are private evidence. Do not log, upload, redistribute or attach
them as a public report. The proposal omits record bodies and message text, but
paths and record pointers can still be sensitive. A future publisher must
recheck every digest; returned JavaScript objects and Buffers can be modified by
their holder after return.

## Losslessness and refusal

Unknown JSON fields, numeric source spelling, line endings, stale timestamps,
released leases, old IDs and decision history are never reserialized into a
replacement record. JSON is parsed only for classification. A grammar scan
rejects duplicate decoded object keys before `JSON.parse` could select a winner.
Malformed UTF8/JSON, excessive nesting, Windows aliases, duplicate records,
unsupported states and wrong receipts produce blockers, retaining all bytes.

Transport shape and resource bounds are preconditions: entries have exactly
`path` and `bytes`, and source containers have exactly the three declared fields.
Unknown transport metadata is refused rather than silently treated as bound;
unknown fields inside retained legacy JSON are preserved byte for byte.
At most 10,000 entries,
5 MiB per file and 32 MiB per supplied bundle. An invalid container/non-Buffer or
oversized transport throws a fixed-code TypeError, leaves caller inputs intact,
and produces no candidate. Semantic refusals return all retained copies. Record,
finding and overlap-analysis budgets are bounded; exhaustion is an explicit
blocker with `analysisComplete: false`, never a successful partial analysis.

Missing task claim UUIDs and missing/invalid lease UUIDs are classified by exact
file and JSON pointer. No UUID is generated, copied into a task, inferred from a
timestamp or promoted from a legacy label. Matching an old lease does not prove
current custody. No task state, acceptance, path list or session is changed.

The module reuses the frozen pure identifier/path-overlap/canonical/validation
exports. The store module imports operating-system facilities for its other
functions; this planner never calls its store constructor, observer, authority
resolver or any filesystem/process operation. No clock, randomness, network,
environment, current directory or native session is consulted.

The Root preparation incident is represented as a supplied-snapshot control:
same-owner `qualification/**` and exact-path active grants still overlap. Both
records are preserved and blocked; the tool does not release or deduplicate
them. A separately supplied released `coveredByExisting` record remains history
and is never made active.

## Status and validation boundary

Blockers produce `blocked_pending_evidence_or_owner_decisions`. A supplied image
without classifier blockers is additionally checked by frozen `validateCorpus`.
Passing that check produces only `reviewable_structural_proposal_only`.

No result establishes original review acceptance, authority, atomic live capture,
quiescence, writer ACKs, current runtime namespace, genesis or native workflow
proof. Unsupported old namespace entries are not excluded or extension-renamed.
Missing handoff bytes or acceptor provenance remain unresolved. The old aedecda
packet is historical evidence, not the current inventory and not an input
automatically read by this tool.

The remaining action boundary is unchanged: Root-approved reconciliation;
actual writer/queue inventory and ACKs; retirement of legacy writes; a fresh
quiescent image; separately reviewed genesis publisher and interruption controls;
one Git-common binding; trusted reads; then a bounded same-seat native canary.
The existing controller remains the only controller.

## Bounded overlap discovery successor

The November 19 private historical capture contained 416 files/3,231,137 raw bytes.
Its supplied summary SHA256 is
`fc37a58b94c55d985670b1511809941df6ce5ec106b73ff1d657aa114a4f7581`.
The original classifier reached 100,000 path comparisons and correctly returned
`analysisComplete: false`. That receipt is preserved; this source change does
not assert a successful rerun or repair any captured record.

The successor indexes only valid active-lease paths. It obtains a Windows-folded
literal segment prefix through frozen `windowsPattern` and stops **before the
first segment containing any `*`**. Two incompatible literal prefixes cannot
overlap under the frozen matcher: normal matches would have to consume equal
literal segments first; inline `**request**` broadening itself compares only
these literal prefixes. A trie query therefore retains prefixes that are
ancestors or descendants, including the empty prefix for a leading wildcard.
Standalone globstars, inline globstars and directory ancestors are never
narrowed into exact filenames. Partial wildcard segments are not indexed as
literal text. Windows normalization/invalid-path findings stay unchanged.

Each retained candidate still calls the exact frozen `windowsPathsOverlap` on
the original path strings. Lease pairs and candidate path indexes retain their
original order, so complete inputs keep the same semantic findings and their
existing canonical sort. Prefix-query results may be cached, but predicate
answers are not inferred from the prefix or from another wildcard pattern.
No input bytes, paths, UUIDs, source receipts or authority fields are rewritten.

The expensive-predicate limit remains exactly 100,000. Discovery has its own
100,000-step allowance, charging trie/prefix construction, queries, visited
nodes, retained candidate references and cache insertion. Its maps/arrays have
bounded retained entries. Exhaustion discards the optimization and resumes the
original scan at the current untouched path, retaining comparisons already
spent. It never returns a partial candidate list, increases the predicate
allowance or marks an unfinished overlap scan complete. Dense adversarial
wildcards still produce `path_comparison_limit`/`finite_analysis_limit` and
`analysisComplete: false`. Discovery fallback alone is not a semantic refusal.
The frozen strict structural validator remains unchanged and is still called
only when the classifier has no findings or resource refusal.

Seven new authored controls supplement the unchanged 39: a 360x360 disjoint
legacy fixture (129,600 old Cartesian comparisons), explicit bidirectional
glob/ancestor/Windows cases, exact small-image finding order, same-prefix
wildcard candidate-cache behavior, a later directory-prefix match, a dense
nested-wildcard budget refusal and discovery-exhaustion fallback with a real
deep overlap. Expected findings are concrete fixtures, not a second matcher.
The scalable classifier fixture deliberately retains one unrelated nonclaimed
task/active-lease defect, preventing the separate frozen validator's Cartesian
scan from obscuring this classifier control. Exact bytes and `adoptable:false`
remain asserted. All 46 controls are AUTHORED, UNRUN for this successor.

## Authored controls and qualification

The companion Node tests use in-memory snapshot fixtures. Fixed source-byte reads
are limited to this implementation and the two frozen contract files in the
test checkout. They read no canonical corpus, launch no process and write no
filesystem state. Controls cover conservation, unknown fields and stale history,
independent hash recomputation, enumeration order, stale receipts, tampered source
pins, missing IDs, unsupported states, exact/path-glob correspondence, same-owner
overlap, Windows aliases/devices, duplicate keys, handoff and acceptance evidence,
messages, mirrors and finite resource refusals.

Tests are **AUTHORED, NOT RUN** at this source freeze. Current local authorization
covers text/hash/diff inspection only: no Node, syntax/AST or runtime checks.
Root selects hosted qualification after independent
exact-source review. The future focused command is:

```text
node --test --test-concurrency=1 scripts/agentic/coordination-qualification/legacy-adoption-proposal.node-test.mjs
```

This focused suite does not replace or rerun the qualified Windows38 suite. It
does not touch the existing 20 frozen factory blobs or authorize live adoption.
