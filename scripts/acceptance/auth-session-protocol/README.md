# Isolated Auth session protocol prototype

This tooling builds a physically owned, ignored copy of installed Supabase
2.108.2. It does not install, replace, import into the application, or change
the shared dependency tree. Run only while Root's resource ledger grants the
qualification slot. All provider data is synthetic and all endpoints use
`fixture.invalid`; the fixture global fetch refuses accidental network.

From the repository root, using the pinned Node 20.19.0 executable:

```powershell
$protocolSourceSha = git rev-parse HEAD
& $node20 --max-old-space-size=384 scripts/acceptance/auth-session-protocol/preflight.mjs C:/xenios-wt/ea2-premium-ui-20261117/node_modules $protocolSourceSha
```

That in-memory source preflight requires its own allocation. It verifies all
ten original pins through the builder's shared real transforms, records each
transformed hash and syntax result, and checks `track` stays unchanged while
only the actual `send` declaration receives the frame parameter. It checks
preserved hashes for the three sources transformed before the prior failure.
No SDK runtime, provider, clock substitute, bundle or transformed source file
is used. Every input is attempted; any failure exits nonzero. This preflight
is authored, NOT_RUN.

Only after Root accepts an executed preflight and allocates a new build job:

```powershell
$protocolSourceSha = git rev-parse HEAD
& $node20 scripts/acceptance/auth-session-protocol/prepare.mjs C:/xenios-wt/ea2-premium-ui-20261117/node_modules $protocolSourceSha
& $node20 scripts/acceptance/auth-session-protocol/qualify.mjs $protocolSourceSha
```

The commands must be sequential. Stop on the first failure. The builder emits
the owned sandbox location and a manifest with source/output hashes, dependency
versions, tool versions, mutation-owner census and shared-input verification.
Keep complete stdout/stderr and exact source SHA in `.receipts/` under this
directory. Both `.sandbox/` and `.receipts/` are ignored. No automatic cleanup,
network dependency download or installation occurs.

Before any source transformation, the builder now writes the new sandbox's
`shared-inputs-before.json` with the full physical shared/copy hash inventory,
tool/package versions and four build-source hashes. `build-status.json` records
phase, PID, source SHA (when passed as the optional third argument), attempted
versus completed source patching and produced outputs. Success or failure
writes a separate after-inventory; failures retain status without promoting
the partial copy to `latest`. Those records were observed in the failed bf7
build; the new transformation preflight remains NOT_RUN.

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
pattern-skipped cases as passes. No corrected-runtime fixture run has occurred.

The `15d0` review additionally required terminal settlement of outstanding
ACK-required sends during stale-frame retirement. The successor adds generic
once-only cancellation and direct local timeout settlement plus successful ACK
and bounded transition probes. This remains source-only and unqualified.

Fresh `50e67c77` qualification actually stopped before compilation on the
SupabaseClient anchor's 8/6-space indentation mismatch versus pinned 6/4.
No fixture ran. Its failed logs/partial copy are immutable; its 552-file hash
comparison is explicitly post-failure reconstruction, not a before-inventory.
The narrow successor fixes only that exact anchor and pre-patch provenance.

The fresh `bf7a2665` build then persisted direct before/after inventories for
all 552 inputs with zero shared changes. It stopped before compilation because
the generic send suffix also matched `track`. Those receipts remain immutable.
The new full-send-declaration anchor and shared preflight have not executed.

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
