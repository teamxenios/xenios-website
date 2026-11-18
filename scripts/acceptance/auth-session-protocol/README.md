# Isolated Auth session protocol prototype

This tooling builds a physically owned, ignored copy of installed Supabase
2.108.2. It does not install, replace, import into the application, or change
the shared dependency tree. Run only while Root's resource ledger grants the
qualification slot. All provider data is synthetic and all endpoints use
`fixture.invalid`; the fixture global fetch refuses accidental network.

From the repository root, using the pinned Node 20.19.0 executable:

```powershell
& $node20 scripts/acceptance/auth-session-protocol/prepare.mjs C:/xenios-wt/ea2-premium-ui-20261117/node_modules
$protocolSourceSha = git rev-parse HEAD
& $node20 scripts/acceptance/auth-session-protocol/qualify.mjs $protocolSourceSha
```

The commands must be sequential. Stop on the first failure. The builder emits
the owned sandbox location and a manifest with source/output hashes, dependency
versions, tool versions, mutation-owner census and shared-input verification.
Keep complete stdout/stderr and exact source SHA in `.receipts/` under this
directory. Both `.sandbox/` and `.receipts/` are ignored. No automatic cleanup,
network dependency download or installation occurs.

`fixtures.test.mjs` checks the synthetic session factory with a locally
injected clock. It does not replace global or SDK clocks. Its per-run epoch
correction remains unexecuted until the next Root allocation. For a fail-fast
qualification, select one named scenario per invocation and stop on its first
nonzero exit, as recorded in the initial stopped-run receipt.

Independent review required SDK refresh/downstream transport corrections.
Old six-artifact sandboxes are rejected by manifest v2. The next allocated run
must rebuild eight artifacts, including Phoenix 0.4.4 CJS/ESM, before new
fixtures. Allow 45 seconds per real retryable-provider case and a ten-minute
overall sequential budget. Stop at first failure or deadline; never count
pattern-skipped cases as passes. No corrected-source run has occurred.

`qualify.mjs` enforces that budget and exact clean Git head, runs discovery with
all cases skipped, then one selected case/worker per child. It preserves full
stdout/stderr and direct/observed worker PID/start/exit receipts. It stops at
the first nonzero exit, invalid one-case result, or deadline and terminates only
its own child tree on timeout. It never builds or takes a resource slot by
itself. Root must still allocate the slot, take fresh memory samples and check
all observed PIDs are absent after the job before releasing custody.

`patch-sdk.mjs` transforms pinned TypeScript source before compilation. It
does not replace SDK-private methods or globals in a running application.
`source/SessionProtocol.ts` becomes part of that owned Auth source copy.
`prepare.mjs` rebuilds actual CJS/ESM public entry artifacts; it does not stub
out the SDK. `fixtures.mjs` supplies controlled storage/mutex/provider/browser
boundaries. Fixtures replace browser globals only in their isolated test
process. They inspect the real Realtime pending promise without changing it.

The complete scope, invariants and acceptance limitations are recorded in
`docs/research-launch/AUTH_SESSION_PROTOCOL_PROTOTYPE_20261118.md`.
