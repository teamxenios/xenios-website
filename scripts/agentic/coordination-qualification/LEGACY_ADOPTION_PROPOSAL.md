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

## Authored controls and qualification

The companion Node tests use in-memory snapshot fixtures. Fixed source-byte reads
are limited to this implementation and the two frozen contract files in the
test checkout. They read no canonical corpus, launch no process and write no
filesystem state. Controls cover conservation, unknown fields and stale history,
independent hash recomputation, enumeration order, stale receipts, tampered source
pins, missing IDs, unsupported states, exact/path-glob correspondence, same-owner
overlap, Windows aliases/devices, duplicate keys, handoff and acceptance evidence,
messages, mirrors and finite resource refusals.

Tests are **AUTHORED, NOT RUN** at source freeze. Local authorization covers only
syntax/hash/diff inspection. Root selects hosted qualification after independent
exact-source review. The future focused command is:

```text
node --test --test-concurrency=1 scripts/agentic/coordination-qualification/legacy-adoption-proposal.node-test.mjs
```

This focused suite does not replace or rerun the qualified Windows38 suite. It
does not touch the existing 20 frozen factory blobs or authorize live adoption.
