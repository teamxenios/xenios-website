# Xenios Site System of Record Protocol

## Purpose

The generated Site System of Record is the bounded, reviewable map of Xenios
site routes and important platform capabilities. It answers four different
questions independently:

1. Is source present or mounted?
2. What focused or full-suite evidence exists?
3. What browser evidence exists?
4. What is actually verified in production?

A positive answer on one axis never implies a positive answer on another.
Source presence is not deployment proof. A mounted route is not an
authenticated smoke. A request is not a paid order, payment is not
fulfillment, and a Care access request is not a clinical action.

## Authority order

1. Current read-only production truth tied to an exact SHA and deploy.
2. Current remote Git graph and exact committed source tree.
3. Preserved worktrees, dirty state, sessions, and path leases.
4. `.xenios/PROJECT_STATE.json` and `.xenios/RELEASE_STATE.json`.
5. Exact-SHA test and browser evidence.
6. `XENIOS_SITE_SYSTEM_OF_RECORD.registry.json`.
7. The generated JSON, Markdown, and CSV projections.
8. Older reports, prompts, package artifacts, and chat history.

## Status vocabulary

Only these values are valid:

- `source_present`
- `mounted`
- `focused_tests_pass`
- `full_suite_pass`
- `browser_verified`
- `built_not_deployed`
- `deployed_not_authenticated_smoked`
- `live_verified`
- `feature_gated`
- `blocked_external`
- `superseded`
- `unknown`

Use the narrow subset appropriate to each axis. When evidence is absent or
stale, use `unknown`; do not infer a stronger state from a filename, route, or
general production SHA.

## Curated capability registry

Facts that code cannot infer—authorization, data authority, evidence,
production state, blockers, founder action, and next action—live in the
reviewed registry. Every important capability must produce all 17 required
coordination fields:

1. capability;
2. persona;
3. route;
4. owning client component;
5. owning server route;
6. authorization boundary;
7. data source;
8. source status;
9. test status;
10. browser status;
11. production status;
12. current source SHA;
13. production SHA;
14. owner and lease;
15. blocker;
16. founder action;
17. next exact action.

Capability IDs are durable. Do not delete one to make validation pass. If a
capability is intentionally retired, retain the record and use `superseded`
with evidence and a replacement or next action.

The registry pins the exact observed production SHA and deploy. Generation
fails if those values disagree with the committed project/release records.
Changing production truth therefore requires an explicit registry update,
not a heuristic inferred from source.

## Route inventory and disappearance control

The generator scans every production `.tsx` file under `client/src` for
literal Wouter `<Route path="…">` registrations. It emits every unique path
with every file-and-line registration. Important capability routes and source
files are separately required by the curated registry.

`site:record:check` rebuilds all three outputs in memory and compares their
bytes with the checked-in artifacts. Any route addition/removal, capability
change, evidence change, or production-record change makes the check fail
until the registry and generated record are deliberately reviewed and
regenerated. Required capability routes and files cannot disappear merely by
regenerating: their registry evidence gate fails first.

## Deterministic exact-SHA basis

Generation requires committed non-record source. The basis SHA is the newest
commit that changed a path other than `.xenios/**` or the three generated
artifacts. This avoids a self-referential generated-file commit while keeping
the runtime/source basis exact. The generation timestamp is the basis
commit's timestamp, not the wall clock.

The generator reads source, registry, production records, task ownership, and
leases from that exact Git tree. It ignores later heartbeat/handoff-only
commits. Non-record working-tree changes cause a fail-closed error.

Workflow for each coherent checkpoint:

```text
1. Run focused tests and other proportionate gates.
2. Commit and push the coherent source slice.
3. Run npm run site:record.
4. Review the JSON, Markdown, and CSV diff.
5. Run npm run site:record:check.
6. Commit and push the generated record as its records successor.
```

## Privacy boundary

The generator reads no environment variables and emits no raw state notes,
customer exports, browser-result bodies, clinical narratives, patient data,
raw payment evidence, credentials, or external provider configuration. It
only emits:

- route paths and repo-relative source locations;
- curated capability descriptions and repo-relative evidence references;
- exact source and production identifiers;
- bounded task/lease identity for each capability;
- aggregate route and status counts.

Closed validation rejects unexpected fields, invalid statuses, unsafe
registry paths, credential-shaped values, email addresses, and inconsistent
source/production identity. Legitimate route terms such as
`/research/reset-password` are not treated as secrets.

## Outputs and commands

```text
docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.json
docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.md
docs/platform/XENIOS_SITE_ROUTE_INVENTORY.generated.csv
```

```bash
npm run site:record
npm run site:record:check
```

The write command validates and prepares every output before installing the
set with rollback protection. The check command is strictly read-only.
