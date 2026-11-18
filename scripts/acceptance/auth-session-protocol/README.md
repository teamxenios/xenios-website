# Isolated Auth session protocol prototype

This tooling builds a physically owned, ignored copy of installed Supabase
2.108.2. It does not install, replace, import into the application, or change
the shared dependency tree. Run only while Root's resource ledger grants the
qualification slot. All provider data is synthetic and all endpoints use
`fixture.invalid`; the fixture global fetch refuses accidental network.

From the repository root, using the pinned Node 20.19.0 executable:

```powershell
& $node20 scripts/acceptance/auth-session-protocol/prepare.mjs C:/xenios-wt/ea2-premium-ui-20261117/node_modules
& $node20 --max-old-space-size=384 --test --test-concurrency=1 scripts/acceptance/auth-session-protocol/protocol.test.mjs
```

The commands must be sequential. Stop on the first failure. The builder emits
the owned sandbox location and a manifest with source/output hashes, dependency
versions, tool versions, mutation-owner census and shared-input verification.
Keep complete stdout/stderr and exact source SHA in `.receipts/` under this
directory. Both `.sandbox/` and `.receipts/` are ignored. No automatic cleanup,
network dependency download or installation occurs.

`patch-sdk.mjs` transforms pinned TypeScript source before compilation. It
does not replace SDK-private methods or globals in a running application.
`source/SessionProtocol.ts` becomes part of that owned Auth source copy.
`prepare.mjs` rebuilds actual CJS/ESM public entry artifacts; it does not stub
out the SDK. `fixtures.mjs` supplies controlled storage/mutex/provider/browser
boundaries. Fixtures replace browser globals only in their isolated test
process. They inspect the real Realtime pending promise without changing it.

The complete scope, invariants and acceptance limitations are recorded in
`docs/research-launch/AUTH_SESSION_PROTOCOL_PROTOTYPE_20261118.md`.
