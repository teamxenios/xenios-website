# Factory assurance v0.1 source integration — November 18, 2026

Task: `FACTORY-ASSURANCE-V01-SOURCE-20261118`. Owner:
`codex-factory-assurance-v01-20261118` / `/root/factory_assurance`.
Application source base: `e6e11c3f923491d55bc2cd221c29da77001a0822`.

This slice imports an offline evidence checker into
`scripts/agentic/factory-assurance/`. It does not mount a cockpit route, install
an adapter, run a controller, repair authentication, resume a seat, or authorize
an application release. The current Early Access candidate remains separate.

## Supply and modifications

The source is `Xenios-Learning-Software-Factory-v0.1-2026-11-18.zip`, 44,904 bytes,
SHA256 `24fae662d0f8779efc3ed3ca234a5599f7f8e6a538bb269937fa075d0f766b6b`.
ZIP integrity and all 18 entries in its supplied checksum manifest were checked
before import. The original ZIP and extracted bytes are preserved privately at
`C:/Users/sboad/projects/factory-assurance-v01-20261118/`.

The initial import preserved the pure module, doctor CLI, tests, and examples.
The corrected successor requires explicit full-suite CI coverage and adds four
regressions while retaining every supplied test body and fixture expectation.
The doctor CLI and examples remain unchanged. Both test files are renamed from
`.test.mjs` to `.node-test.mjs`, following the repository's Node-test convention.
The nested package test command follows those names.
The repository Vitest configuration explicitly includes only server/shared/client
TypeScript tests, so this import does not need a Vitest exclusion or configuration
change. No root package, lockfile or dependency tree changes.

`SOURCE_IMPORT.json` maps every supplied path to its imported path and records
both hashes. Imported hashes use canonical LF Git-blob bytes, not a Windows
worktree's CRLF bytes. The new provenance regression verifies that convention
across all mapped files. `SUPPLIED_MANIFEST.sha256` and `SUPPLIED_VALIDATION.json` retain their
original bytes and names inside those historical records. The supplied manifest
describes the original archive, rather than the renamed import. The README adds
a source-only status banner and updates those references.

The supplied validation says Node 24.22.3/Linux, 63 passed tests, zero skips, and
synthetic replay results. It is historical supplied evidence, not independent
qualification on X1. No speed improvement, hidden holdout evaluation or live
factory milestone follows from those examples.

## Qualification status

The initial import predecessor is `eeedfd0f5f3590e6eaa7684f4fd679d74793e4d1`.
Root recorded its Node 20.19.0 63/63 pass and all-five hosted check pass in
KAN-234/13446. Independent source review then required the CI-scope and two
documentation-hash corrections. That earlier execution does not qualify this
corrected source.

At this corrected source checkpoint:

- ZIP integrity and supplied hashes: PASS.
- Static import/provenance review: performed by the importing author.
- Pinned Node 20.19.0 `--check`: PASS for the four imported `.mjs` files; syntax only, no runtime or test execution.
- Node 20.19.0 successor test execution: NOT RUN; Root retains the shared test allocation.
- Required hosted successor checks: NOT RUN for the corrected source.
- Independent source review: PENDING.
- Existing cockpit/controller integration and browser proof: NOT RUN.
- Production, provider, role, email and paused-seat mutations: NONE.

After Root grants a slot, the exact imported suite command is:

```powershell
& 'C:/Users/sboad/projects/xr-toolchains/node-v20.19.0-win-x64/node.exe' --test scripts/agentic/factory-assurance/factory-assurance.node-test.mjs scripts/agentic/factory-assurance/factory-cli.node-test.mjs
```

No install or build is needed. Capture complete stdout/stderr and exit status.
The attention-required fixture intentionally exits 1; that diagnostic outcome
must not be described as a crashed test run. Fixed `--now` is appropriate only
for the supplied synthetic replays. Any current export uses actual current time.

The corrected `ciPass` requires `details.scope === 'full_suite'` in addition to
the mandatory passing check set. It does not rewrite or close old unidentified
failure records. All supplied tests and example expectations remain intact;
the existing positive fixtures already had explicit full-suite scope. The four
new cases cover subset CI without another failure, missing/unsupported coverage,
immutable historical unidentified failures, and canonical import provenance.
Root's separate independent three-case review fixture remains external and
unchanged, not a claimed executed benchmark or hidden holdout evaluation.

## Existing integration seams reserved to Root

The base has one existing loopback cockpit in `scripts/xenios-control/server.mjs`
and `lib.mjs`. The `api(request, response, url)` function performs the exact Host
check before its GET handlers. The existing `json()` response function applies
no-store, CSP, same-origin, no-referrer and MIME protections. A future
`GET /api/factory/assurance` can be added inside that guarded function and use
that same response path. It must not become an action, dispatch, permission or
release endpoint. Root owns the actual router/UI changes; they are absent here.

The module API for that future composition is:

```js
import { assess, normalizeRegistries } from '../agentic/factory-assurance/factory-assurance.mjs';
```

The current `xenios-os.mjs` registry paths remain the authority. Its
`activeSessions()` reads individual `.xenios/sessions/*.json` records. The
supplied normalizer reads the aggregate three registries only; it explicitly
does not reconcile individual session state or establish an atomic controller
revision. `collectStatus()` is an existing status collector, not a trusted
aggregate task/session export. Do not invent a new export timestamp or revision
to claim those gaps are closed.

Before a trusted mount, Root's exporter must identify the actual canonical
controller/worktree, reconcile aggregate and individual records, preserve source
timestamps and hashes, and detect mixed or changed snapshots. The current
multi-file coordinator writes do not establish a shared transactional revision.
Report that missing guarantee explicitly until the established controller is
extended and qualified. A fresh copy of an old file is still old evidence.

The read-only CLI is already usable with an operator-selected registry export:

```text
node scripts/agentic/factory-assurance/factory-doctor.mjs assess --registries PATH_TO_EXPORT
```

That is an offline assessment of supplied evidence. It neither authenticates
issuers nor fetches receipt URLs. Its findings cannot grant a lease or approve
a release. For a cockpit response, project only bounded claim IDs/verdicts/codes,
runtime readiness, counts, timestamp, advisory/none authority, and stable finding
codes. Keep raw registry records, notes, command output, evidence payloads,
credential values, customer data and arbitrary receipt bodies out of the response.
Render text as text; do not treat supplied identifiers or evidence as HTML.

The package bounds JSON inputs to 5 MiB and array lengths to 10,000. Its lease
overlap comparison is quadratic and understands exact paths and terminal `/**`
subtrees only. Do not expose arbitrary registry/policy paths or unbounded inputs
through a public or browser-selected endpoint. Reuse the established path-overlap
implementation for complex glob authority; advisory unassessable is truthful.

## Runtime and learning boundaries

Root's separate read-only investigation identified a schema-compatible native
factory source at `c50e3afe17357fe247d2f4da4c8ae03dffdcd2a3` and the already accepted
observation-only v2 adapter at `c9d1ae120e93a8fd21986ab5fc7b0be6c4be1055`.
Those are separate source/evidence records, not imported or replaced here.
Matching source shape is not usable authentication, continuous process custody,
fresh task progress, or a restored OpenRig daemon. Keep unknown values unknown.

The examples demonstrate separate source/CI/deployment/browser/provider/inbox
claims and proposal-only lessons. They do not meet the first live milestone:
one real bounded task with observed authenticated operation, independent handoff,
interruption/resume without duplicate effects, executable prevention, fixed
baseline/candidate evaluation, exact integration SHA and a usable runtime receipt.
Those increments remain with Root and the existing factory lead/reviewer.
