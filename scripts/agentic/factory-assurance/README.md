> Repository import status: UNMOUNTED SOURCE. Root qualified the predecessor `eeedfd0f` with 63/63 tests on Node 20.19.0 and passing hosted checks (KAN-234/13446). This corrected successor adds four regressions and remains untested until separately allocated. The original Node 24/Linux delivery record is preserved in SUPPLIED_VALIDATION.json. No controller, cockpit, runtime adapter or production integration is installed. See SOURCE_IMPORT.json and docs/coordination/FACTORY_ASSURANCE_V01_INTEGRATION_20261118.md.

# Xenios Factory Assurance 0.1

**A working, offline foundation for a more reliable learning software factory.** It checks supplied evidence, preserves uncertainty and proposes lessons for review. It extends the existing Xenios control approach; it does not run the live factory.

Prepared November 18, 2026. All bundled demonstrations are synthetic. No customer, account, credential, production registry or private email payload is included.

## What is implemented

| Component | Behavior |
|---|---|
| `factory-assurance.mjs` | Pure evidence assessment, registry normalization, lesson proposals, evaluation and comparison |
| `factory-doctor.mjs` | Bounded JSON input and read-only command line interface |
| Module and provenance tests | 62 cases: 58 supplied cases plus four CI-scope, failure-preservation and canonical-hash regressions |
| CLI tests | 5 cases, including unchanged input files and rejected authority overrides |
| `examples/` | Passing and attention-required snapshots plus 12 synthetic replay cases |
| `SUPPLIED_VALIDATION.json` | Recorded test environment, counts, replay results and limitations |
| `IMPLEMENTATION-PLAN.md` | Integration architecture, remaining work and acceptance criteria |
| `ROOT-GOAL-PROMPT.md` | An execution prompt for the existing release owner and factory lead |
| `RESEARCH.md` | Primary-source rationale for the Lauren Tan / pstack adaptations |

## Run immediately

No dependency installation is required. The supplied delivery was executed on **Node 24.22.3 on Linux**. Root subsequently qualified the unchanged predecessor on the pinned **Node 20.19.0** runtime. Qualify the corrected 67-case successor separately before integration; the predecessor's pass does not qualify changed code.

From this directory in PowerShell, Terminal or Bash:

```sh
node --test factory-assurance.node-test.mjs factory-cli.node-test.mjs
node factory-doctor.mjs assess --snapshot examples/supported.json --now 2026-11-18T15:30:00.000Z
node factory-doctor.mjs assess --snapshot examples/needs-attention.json --now 2026-11-18T15:30:00.000Z
node factory-doctor.mjs evaluate --cases examples/evaluation-cases.json --now 2026-11-18T15:30:00.000Z
```

The fixed time replays the fixtures. **Use the real current time for live exports**, by omitting `--now`. The attention example exits 1 deliberately. A run that reports findings is a successful diagnostic operation, not a crashed program.

Command conventions:

- Exit **0**: no assessment findings, a valid evaluation, generated proposals, or a comparison suitable for review.
- Exit **1**: assessment findings, invalid evaluation, or a rejected comparison.
- Exit **2**: invalid arguments, unreadable files or malformed input.
- Output goes to stdout; bounded input errors go to stderr. The CLI performs no network requests or writes.

## Read the existing registries

Use the **current controller's export**, not old GitHub files, to assess operational state:

```sh
node factory-doctor.mjs assess --registries PATH_TO_CURRENT_EXPORT
```

That directory must contain `ACTIVE_TASKS.json`, `CODE_OWNERSHIP.json`, and `SESSION_REGISTRY.json`. The normalizer accepts their observed schema version 1 and strips unused payload fields. It keeps original `updatedAt` timestamps. A fresh copy of an old file remains old evidence.

The inspected ownership registry has no root authority timestamp. Its freshness therefore remains unknown. The normalizer does not invent one. A future exporter must obtain an authoritative revision and observation from the existing controller, reconcile individual session files, and emit the normalized snapshot directly.

Additional observation records can be supplied using:

```sh
node factory-doctor.mjs assess --registries PATH_TO_CURRENT_EXPORT --evidence OBSERVATIONS.json
```

This overlay may contain only `schemaVersion`, `claims`, `receipts`, `runtimeFacts` and `resources`. It cannot overwrite ownership, task state or source timestamps. Input files are limited to 5 MiB; normalized arrays are bounded to 10,000 records each. This is an offline reader, not a public service endpoint.

## What a result means

Every claim has one of three results:

| Result | Meaning |
|---|---|
| `supported` | The supplied records meet the specific evidence rule |
| `unsupported` | Supplied evidence contradicts the claim, such as a current failing test or author self-review |
| `unknown` | Required evidence is absent, mismatched, stale or inconclusive |

`mode: advisory` and `authority: none` are present in every assessment. A zero-finding report is named `no_findings_in_supplied_evidence`; it is not a statement that a service is live or healthy.

**The module validates metadata and relationships. It does not fetch evidence URLs, authenticate receipt issuers, inspect provider logs, cryptographically attest observations or verify the truth of supplied records.** Trusted adapters and independent runtime evidence remain necessary.

### Evidence distinctions

- A full 40-character SHA, repository and task must match.
- CI qualification requires an explicit `details.scope: "full_suite"` plus passing build, typecheck, test, protection and Required CI completion. Subset, missing or unsupported coverage remains unknown even when those five names pass. Policies can add checks but cannot remove that baseline. Root should confirm the current required job set and extend the policy when needed.
- A passing subset does not clear an unidentified failure. A current failure needs a later, explicitly linked, qualifying full-suite receipt.
- Source review requires a reviewer distinct from the author.
- `deployed` means a **recent observation** of the specified SHA, environment and deployment ID; its default freshness window is five minutes.
- A nonlocal browser result needs a recent matching deployment observation and the same deployment ID at the beginning and end of the journey.
- Local browser evidence stays local and needs a clean-source declaration.
- Provider acceptance and observed inbox delivery are separate claims, correlated by notice, provider message and recipient tag. Neither establishes that a person read the email.
- Session assignment and heartbeat alone do not establish usable authentication or a running process.

Defaults are 30 minutes for authority-source freshness, five minutes for runtime/deployment observations, 30 seconds clock skew and 700 MiB free memory. These values are visible policy inputs, not hidden permissions or proof that a job is safe to start. The report never starts it.

## Learning and evaluation

`proposeLessons(assessment, reviewedLessons)` groups repeated supported finding types across distinct subjects. It emits deduplicated **proposals** with evidence IDs, an unverified cause and a suggested prevention. Repetition alone does not prove causality. It never edits prompts, skills, source or permissions.

`evaluate(cases, policy)` records exact expected and actual verdicts. Metrics expose numerators and denominators: unsafe acceptance, false blocking, correct uncertainty, recognition of supported claims, accuracy and coverage. Empty populations return `null`, not a perfect score.

`compareEvaluations(baseline, candidate)` requires the same frozen dataset, stable expectations and critical designations, distinct incident groups across development/holdout, complete results and consistent metrics recomputed from individual cases. It rejects unsafe acceptance, critical failures, regression or absent measurable improvement. The best result is `review_candidate`; promotion is never automatic.

These controls prevent several bookkeeping errors. They do **not** prove that supplied holdout labels were independently concealed, that two incident groups are semantically unrelated, or that a result generalizes to unseen production work. The bundled examples demonstrate mechanics only.

## Integration boundary

Root should place these files within an approved new path and mount a sanitized read-only report in the existing loopback cockpit, if useful. The suggested seam is `GET /api/factory/assurance` inside the existing guarded router. This delivery does not modify that router.

Keep the established task registry, ownership controller, approval rules, source-browser exclusions and heavy-job governor. The module's overlap check intentionally understands only exact repository-relative paths and terminal `/**` subtrees. Complex globs are marked unassessable and must use the existing path-overlap implementation.

**Not implemented here:** a new scheduler, worker spawning, atomic registry transactions, live authentication repair, provider adapters, persistent event ingestion, a cockpit screen, automatic retries, real incident benchmarks or production deployment. `IMPLEMENTATION-PLAN.md` assigns those next steps without treating them as completed work.

## Verification and integrity

The supplied delivery recorded **63/63** tests with no skips on Node 24/Linux. Root's separate Node 20.19.0 predecessor qualification is recorded in KAN-234/13446. This corrected source retains all 63 original cases and adds four regressions; no 67-case execution is claimed yet. Historical supplied CLI replay output and caveats remain in `SUPPLIED_VALIDATION.json`. `SUPPLIED_MANIFEST.sha256` lists the original archive files' hashes; `SOURCE_IMPORT.json` maps the import using canonical LF Git-blob hashes and records each adaptation. No third-party pstack implementation was copied into this package; its published practices inform the design.
