# Quick Order HTTP ownership correction — authored, unqualified

Coordinator request `25ca24b07ef8bab2a7dd97fd0ad576fc08a1bc48`, narrowed by Samuel's
full `20a5d445-6335-4de9-a6db-0cc00c656149/Pasted text.txt`, authorizes only
QO-P2-03/QO-P2-04 corrections in the current server module and this lane's
packet/records. The exact source commit/tree will be recorded in the handoff
after the coherent slice is pushed. No test reservation accompanies this request.
The narrower request permits only the listed packet corrections; doc 36's A2
conditions remain future holds, not a design revision or drafting grant.

## Source behavior

`paths.mjs` and its matching declaration define one nonthrowing classifier used
by `containment.ts`, `handler.mjs`, and the handler's parser-error middleware.
It returns `unrelated`, `owned-valid`, or `owned-malformed`. It considers both
the original target and effective `url`; Express derives `path` from that
effective URL, so there is no separate Express-path ownership predicate.

Ownership conservatively covers the raw and one-pass percent-decoded path,
case folding, backslashes, empty slash segments and WHATWG dot-segment
normalization. Absolute-form targets are inspected for ownership but never
accepted. Leading `//` is always a path, never an external authority. Raw
owned-looking paths remain owned even if `../` normalizes outside the namespace.
Query/fragment contents do not create ownership of an otherwise unrelated path.

Acceptance remains narrower: a canonical origin-form path with an exact-case
prefix, no duplicate slash, backslash, percent-encoded path, fragment, control
character or URL normalization change. This refuses aliases rather than making
them usable endpoints. Canonical query parameters remain supported. A full
`originalUrl` with a canonical mount-stripped `url` and matching query remains
valid; conflicting target views are refused before ports or body access.

| Classification | Disabled containment | Handler | Parser-error middleware |
| --- | --- | --- | --- |
| Unrelated, including malformed or absolute targets | `next()` | `next()` before ports/body | Forwards the same error to `next(error)` |
| Owned-valid | Fixed private 503 before JSON/rawBody | Existing origin, session, rate, CSRF, limits, config/replay and endpoint checks | Existing 413 / invalid JSON 400 / fixed unavailable 503 mapping |
| Owned-malformed | Same fixed private 503 before JSON/rawBody | Fixed scoped `invalid_request` 400 before ports/body | Same scoped `invalid_request` 400 |

The concrete predecessor mismatch involved dot segments (literal or encoded)
and backslashes: the handler's WHATWG path could enter the namespace while the
containment's literal predicate did not. Uppercase alone was unrelated to both
predecessor case-sensitive predicates, **not an existing differential or leak**.
Its conservative refusal is the explicit policy in this correction. No customer
sink or leak is asserted. Intake remains unmounted and disabled.

## Authored regressions — NOT RUN

The loopback Express containment tests now send an explicit `httpRequest({path})`
for the new adversarial matrix, avoiding fetch normalization. They assert the
fixed response, zero parser/verifier calls, and absent body/rawBody for owned
case, dot, encoded-dot, backslash, leading/interior slash, encoded-separator,
absolute-form, root/query, and raw owned-exiting-namespace targets. Unrelated
neighbors, malformed escapes, absolute targets and query-only matches provide
positive parser controls. This still mirrors host composition; it is not an
executed application route proof or reverse-proxy normalization proof.

Node handler regressions use direct probes that reject every port call and
body/stream access. They distinguish unrelated passthrough from owned malformed
refusal, verify original/effective conflicts, preserve mounted canonical paths
and query behavior, and cover all three parser-error classifications. Existing
origin, body-limit, CSRF, replay and legal/config tests are unchanged.

No Node tests, Vitest, syntax check, typecheck, build, aggregate, browser or DB
qualification was launched for this correction. The old `fc11f54` reservation
was released after the 503 MiB precheck refusal; it cannot authorize this source.
A fresh bounded reservation with its own exact-source prechecks is required.
The historical relocation verifier and reservation precheck remain tied to
`f1e467f`; their 22-file inventory is not a qualification plan for this successor.

Coordinator's message reports a fresh 21:07:57Z host sample: 1,331 MiB available
RAM, 13.91 GiB on C:, and no matching heavy Node job. This is attributed
coordinator evidence, not a new measurement by this builder. Disk is below the
20 GiB requirement, so no reservation can be granted. No cleanup or relaxed
threshold is part of this work.

### Targeted red/green plan — commands not executed

Baseline runtime is the reviewed `f1e467f74b01ae2ab866bb791a3c11d657a5d69c`
(tree `6bc4fd7a7483822d4af87a3c07ab7263c0fbc377`), identical at `c807f19`.
Both red and green must use the **same successor test blobs**, identified in
the exact-source integrity receipt; do not use the old tests to claim red.
The green runtime is the pushed HTTP source identified in the handoff. Record
each copied runtime/test/config SHA-256 and Git source/blob identity before and
after running, exact command/executable, raw stdout/stderr, exit and resources.

After a new slot and per-job precheck only, prepare two separate scratch
directories within this lane's evidence area. Materialize the respective Git
blobs for `core.mjs`, `handler.mjs`, `containment.ts`, `tests/fixtures.mjs`, and
(green only) `paths.mjs`/`paths.d.mts`; overlay identical successor
`tests/handler.test.mjs` and `containment.test.ts`. Preserve relative layout.
These copies do not edit the working source or any protected/shared file.
Use a scratch Vitest config with Node environment and an exact include for
only that scratch containment test, so the repository-wide suite is not run.
Hash that config as part of each snapshot. Use the existing dependency junction
without installing packages or writing its cache.

Proposed command templates, each resolved to an absolute scratch path and
recorded literally in its eventual receipt:

```text
<pinned-node20> --max-old-space-size=128 --test --test-concurrency=1 --test-name-pattern="^(unrelated malformed, absolute|owned path aliases|conflicting original|canonical exact roots|parser error ownership forwards|parser errors on owned aliases|canonical parser error paths)" <snapshot>/tests/handler.test.mjs
<pinned-node20> --max-old-space-size=1024 node_modules/vitest/vitest.mjs run --config <snapshot>/vitest.config.mjs --maxWorkers=1 --no-file-parallelism --cache=false --reporter=verbose -t "refuses owned raw target|leaves unrelated raw target"
```

Run each approved red/green job serially, subject to its own slot/resource
checks. Red should expose the concrete predecessor dot/backslash containment
failures and unrelated malformed handler interception; some positive controls
and prior refusals will already pass. Green must pass the targeted matrix.
A baseline failure alone does not prove the fix; record every failure and
skipped-by-filter test honestly. Do not repeat the accepted 73+116 merely to
transfer receipt ownership. Adjacent exact-origin, CSRF/body-limit/config/replay
regressions remain intact; any additional execution needs explicit inclusion
in the bounded reservation. No red or green result is claimed yet.

## Review and evidence boundaries

Doc 36 (`2d7533f2d3d3a1c69ea686170524d7af4dd6b064`) accepted predecessor module
bytes with limits but rejected their old location. Doc 37
(`324183e886af369a4ea27b9bf0f7b9c615b32139`) accepted the pure relocation,
closing QO-P1-A and the classification disclosure in QO-P1-B. Those dispositions
do not accept this semantic correction. Its independent review remains pending.

Reviewer Node 73 and Vitest 116 passes at `c807f19` are independent predecessor
evidence. They are not builder qualification of this successor. The recorded
reviewer Vitest free RAM of 1,206 MiB was below the coordinator's 1,536 MiB
threshold, and no new builder reservation existed. Preserve these limits without
converting the runs into an authorized builder receipt. Historical raw receipts
and their source bindings remain unchanged; no test counts are pooled.

The containment export/import contract is unchanged, so the six A1 proposal
pairs and patch `c65d7e49a9f5ec87262d4e3b106ab5e16b1c3d1ecd46a01c8a7ca4699e6d92af`
remain unchanged and unapplied. The old `6481c2ad…` patch remains held. Fourteen
protected/shared baselines, manifest, SQL, application mounts and existing
business/authority source are outside this edit. See `APPROVAL_MATRIX.md` for
GATE-01 sequencing, the extra PWA HARD dependency and regression conditions;
doc 36 section 7 retains A2 dependencies as future holds. The persistence design
is not revised by this narrower slice, and no A2 drafting is authorized.

## Own records only

The existing session and lease are reused. Git tracked no old module paths and
a recursive read found no remaining files in the old directories. Only this
owner's obsolete `client/src/quick-order/**`, `server/health/quick-order/**` and
`shared/health/quick-order/**` reservations were removed. The current Research
prefixes, own packet, session file and exact handoff remain reserved.

The three branch-local shared registries are **not whole-file leases**. Authority
covers only this session's existing entry in `SESSION_REGISTRY.json`, this task's
entry in `ACTIVE_TASKS.json`, and this exact lease in `CODE_OWNERSHIP.json`.
Other entries and global registry timestamps are preserved; the own session/lease
heartbeat records this activity. No global fleet takeover or new registry lease
is inferred. Cross-chat messaging approval is still pending; report here only.
