# Exact founder-approved TC25 App protection amendment

## Actual authority and scope

Samuel's user-designated pasted request, observed and recorded on 2026-10-12
at 18:16:38.438 UTC in the existing coordinator chat, approves the prepared
App-only manifest amendment, including both the access-hub redirect removal
and the independently accepted disabled Quick Order composition. The actual
message-sent timestamp is not exposed and is not backdated.

The three identical originals are attachment IDs
`26338d2c-0ef8-4893-ac69-77c34553e362`,
`90cb0ec6-1a77-4628-8777-1e8455970a7a`, and
`defc516d-40cf-4d60-8524-404bc59558f9`, each `Pasted text.txt`.
Their raw SHA-256 is
`20041ef092f750a4a2ebbe7c4bdfb5cff3d4bf0d93b5a2f3aa4aebededb6eee3`
(14,993 bytes). The coordinator preserves the raw copy and authority receipt
at `04b4cc70e809486230c12cef6a5d8530967f9dc2`, under
`docs/coordination/launch-coordination-20261005/`:

- `ACTUAL_FOUNDER_MANIFEST_CUSTODY_AND_CONDITIONAL_RELEASE_20261012.txt`
- `ACTUAL_FOUNDER_MANIFEST_CUSTODY_AND_CONDITIONAL_RELEASE_AUTHORITY_20261012.json`

This follows the precedent at
`663268fdf537da9349327c097d431dabeef56a70`,
`docs/phase2/HEALTH_PROTECTED_HASH_APPROVAL_20261001.md`.
The independent TC25 reconciliation is
`582c763fa1158894b24fb62465c132da32c2f739`; Doc97 at
`5a8b8fa2889a9a822a463e3afb2d0d0dcc267f01` closes the receipt/composition
review series. Those reviews are not a new execution or release verdict.

## Exact amendment

Prepared patch raw SHA-256:
`5e539cea6f5f683ee4d5c23dec0e6108fde83519d164907a51aa7054e917f516`.
It changes only the App entry in `seamBaselineHashes.files` and adds its
exact prepared provenance comment. The comment's historical word `proposed`
is intentionally preserved to match the approved patch; this separate record
establishes the actual subsequent approval and application.

The companion brief calls this a `fileHashes` amendment. The actual approved
proposal and existing manifest place App under `seamBaselineHashes.files`.
No new `fileHashes` row is created.

| Path | Previous SHA-256 LF | Approved SHA-256 LF |
| --- | --- | --- |
| client/src/App.tsx | 3b3b808b23cccdf8d2e2179fd30349b3ae299137a8a4a5f33525e0a304828d80 | 1ee2d576ea617ff74f76ff345a916c2d88352828af003e2f855b42611b6a76a0 |

Accepted source: `25741f0b5fdff6320214227a896c2b6320c1fb9a`.
Source tree: `0c5a2b11e363a11f950671b928b55086b3f77f81`.
Starting records: `876ede5bb7e78fe9834900c4d9ca2924458b4698`.
Unchanged App blob: `b5cc8edcc1040eca4009d8e1b68627ae7492d459`,
18,079 LF bytes. Windows checkout CRLF bytes may differ; the gate uses LF
normalization. `intakeEnabled={false}` remains literal and unchanged.

Expected pre-amendment manifest blob:
`241fc344445a12dbf7861232248393a742105526`.
Exact approved candidate SHA-256 LF:
`95445fdf1855560460da2283d06f9dda733e373c1258611ec278cd499e74a23d`.
No other hash, zone, route, runtime source, test, skip, timeout, GATE setting,
legal adoption, provider flag or hosted configuration is changed.

## Operational custody

The existing integrator, `codex-accepted-source-integration-20261005`, chat
`01a0e098-3b23-7233-9b07-877ace092650`, holds exclusive one-time lease
`tc25-app-manifest-integrator-20261012` in
`C:/xenios-wt/tc25-app-manifest-20261012`, branch
`codex/tc25-app-manifest-20261012`.

The actual builder acknowledgment in chat
`01a10d78-0981-7150-9292-c5cde2730d4d`, message
`msg_0f39ac48c4ef0110016acd251e230087d1bd5c4571cf4f9af3`, confirms clean
b22f at `876ede5b`, stopped source/Git writers, finished helper, and no
pending dirty work or writer in the manifest/provenance/seven-path scopes.
The existing integrator accepts that custody only. Historical handoffs and
all other reservations remain unchanged; no incumbent ACK is invented.

The separate seven-path registry action is local one-file commit
`c27853fb824d87eb6f962b4b9af28e6482cdb6a6` on the coordinator branch.
Coordinator Git custody was returned immediately. Fable implementation
requires its own actual receiving acknowledgments and disjoint child leases.
It is not part of this manifest candidate.

## Bounded verification and release limits

The new instruction permits the applicable isolated synthetic/local check.
Bind the exact committed amendment, existing Node 20.19.0 runtime,
compatible existing dependency installation, explicit comparison refs,
commands, finite bounds and serialized execution reservation before running.
Use no dependency installation, SQL, hosted calls or real messages.

The intended checks are the unchanged protection CLI against explicit base
`876ede5bb7e78fe9834900c4d9ca2924458b4698` and amendment SHA, followed by
only `server/core-site-protection.test.ts` with one worker and no file
parallelism. The CLI merely reports seam drift; its PASS alone is not a
clean-seam verdict. Preserve every unrelated failure, especially the
unchanged Research gateway baseline. Record actual results separately.

Full S3 transaction qualification remains held on its own operational,
descriptor/census, driver and execution requirements. No claim of full suite,
build, browser, payment, transaction qualification or live behavior follows
from these narrow checks. Conditional publication/release prerequisites are
not yet satisfied. This amendment is LOCAL ONLY: no push, migration,
deployment, customer intake, email, payment, or staging/production mutation.
