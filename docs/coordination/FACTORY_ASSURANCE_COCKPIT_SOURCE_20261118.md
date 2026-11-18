# Read-only factory assurance cockpit source

Task `FACTORY-ASSURANCE-COCKPIT-SOURCE-20261118`, existing owner
`codex-factory-assurance-v01-20261118` / `/root/factory_assurance`.
Base: qualified #503 `586ad7e6a0d3755a3b69f1effa1318e25cab8e9b`.
This is an isolated source increment, not a running cockpit or exporter adoption.

## Existing seams and preserved authority

The existing Node cockpit keeps its loopback binding, exact Host check,
Origin/CSRF mutation guard, security headers, action allowlist and runtime
toolchain check. The new GET `/api/factory/assurance` sits inside that Host
guard. It rejects other methods and all query/body input before calling its
source. No path, command, policy or evidence selector is accepted. A local
bootstrap anti-CSRF token is not staff or worker authentication evidence.

There is no Python HTTP server in the inspected clean factory source
`c50e3afe17357fe247d2f4da4c8ae03dffdcd2a3`. This slice imports the accepted
#503 pure assessor/normalizer directly into the existing Node process. It does
not start a Python bridge or subprocess on GET, call supervisor status/run,
repair journals, initialize bindings or change task inputs. No `lib.mjs`, action,
style, Python, service, root-package, dependency or lockfile change.

## Required server-owned source port

`createFactoryAssuranceReader` requires `readPublishedExport({signal})` supplied
by server code. `createControlServer` selects the fixed unavailable source by
default. Until Root adopts a qualified published export, this returns HTTP503
with `availability: unavailable`, `authority: none`, null source/counts and
unknown runtime evidence. There is no raw-directory or current-time fallback.

The port may return `{kind: 'unavailable', reason}` with a fixed code:
`export_not_configured`, `export_unavailable` or `recovery_required`. Its published
form is `{kind: 'published', publication}`. Publication has exactly:

```text
schemaVersion: 1
qualification: qualified_coherent_export_v1
controllerId: bounded identifier
controllerRevision: positive safe integer
controllerSourceSha: full lowercase source SHA
capturedAt / publishedAt: timezone-qualified timestamps
registryFiles: ACTIVE_TASKS, CODE_OWNERSHIP, SESSION_REGISTRY
  each: exact utf8 bytes and sha256
evidence: claims, receipts, runtimeFacts arrays
nativeObservation: null, or utf8 / observedAt / fileModifiedAt
```

This structural marker is not authentication or proof that a file issuer is
trusted. Root's producer must establish publication custody, the actual
controller revision, protocol adoption and coherent source hashes before
returning it. That integration is absent here. No browser/request input can
select or substitute the producer. An untrusted JSON file cannot establish
authority merely by declaring the marker.

The reader checks hashes of exact published registry bytes, parses those records,
and calls `normalizeRegistries`. Each source's `authoritativeAsOf` stays the
registry's original `updatedAt`, including stale or missing values. Capture,
publication and assessment timestamps remain distinct; they never refresh an
old authority timestamp. The reader does not synthesize claims/receipts from
task state, accepted-SHA fields, narrative, heartbeat or process presence.

The port must be read-only and honor AbortSignal. Reads are single-flight with
a 1.5-second default timeout; a producer ignoring abort blocks further underlying
reads until it settles rather than accumulating work. Inputs are capped at
1 MiB of registry/evidence text, 512 records per array, 64 paths per lease and
512 active paths total to bound pairwise overlap assessment. Output lists are
capped at 100 with truthful total/truncation fields. Native input keeps its
accepted 64 KiB bound. Upstream errors and free-text payloads are never echoed.

## Native observations and sanitation

`native-observation-summary.mjs` is copied byte-for-byte from accepted source
`c9d1ae120e93a8fd21986ab5fc7b0be6c4be1055`:
SHA256 `1e2acdbb4312c4b5726ed946e960d01caa84aef52cc005ea9dcbf2a9ffff41b0`.
It remains the strict c50-schema pure projector. No parallel parser or native
controller is introduced. Input/configuration hashes are context, not runtime
attestation. The cockpit projection includes only bounded task/seat context,
reported state and original observation times. Tokens, dispatch keys, raw
configuration, packet text and result reasons are not exposed.

Native current authentication and execution remain null even when an operator
once reported blocked_auth, or a process was observed. File modification time
and capture time are displayed as observations, not authoritative freshness.
The existing supervisor deliberately avoids rewriting unchanged report bytes;
an old file alone proves neither process death nor current usable authentication.

The UI has a read-only Factory assurance tab and GET-only refresh. It shows
supported/unsupported/unknown evidence, supplied runtime readiness, source
revision/timestamps, native observation context and gaps. It uses existing
styles and escaped text, adds no action, and does not auto-poll or repair.
No claims supplied means no work was established, rather than global success.

## Qualification and next ownership

The authored source tests cover the closed source default, timestamps, absent
auth/CI inference, explicit full CI scope, privacy projection, old native
observations, malformed/hash/size/path-work limits, output truncation, errors,
recovery and non-accumulating timeouts. Existing control tests are extended with
actual HTTP Host/input/method/default-unavailable and safe-positive cases.
Original security checks remain intact.

This source checkpoint has NOT run those tests, built, opened a browser,
started the cockpit, installed an export/binding or changed the existing
Python/daemon/service state. Root retains exclusive test allocation, exact
hosted Node-test integration, #504 adoption barrier and current-export producer,
independent review, source merge and later cockpit start/browser acceptance.
The existing application Vitest does not execute these script Node tests.

After allocation, the focused command is:

```text
node --test scripts/xenios-control/assurance.node-test.mjs scripts/xenios-control/control.test.mjs
```

Use the pinned Node 20.19.0 executable, complete output and the exact source SHA.
The prior #503 67-case receipt does not qualify this changed cockpit source.
