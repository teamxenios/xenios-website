# B preview portal-flag parity handoff

Pushed code: `a19037d1a1e066f5438798c237cea1d1d2cf8a42`; tree `c4750d9e247b756b6eda9cb95ec198ddbe3a9be2`.

Parent: A integration `9b5e61b53feb547a9fd384d02e75b0c2755546c8`. Isolated branch `codex/resource-hub-browser-fixture-20260907` in `C:/Users/sboad/projects/xenios-resource-hub-browser-fixture-20260907`.

A explicitly delegated the sole code path `scripts/preview-resource-hub.ts`. The local task/session registration records that transfer; A confirmed central removal of the path from its active lease. Do not cherry-pick the local registry wholesale.

The patch sets the local preview's default affiliate system/portal inputs to the observed production values and uses the actual `affiliatePortalEnabled` predicate before registering its partner resource routes. Explicit false inputs remain available for controls. No guard, identity, production setting, resource authority or other runtime source was changed.

Node 20.19.0 self-test: 3/3 flag combinations passed. Both true registers the resource routes and returns the expected empty library envelope through the locked wall and synthetic member guard. Either false leaves those resource routes unregistered. The self-test checks exact response keys and a valid `asOf` timestamp.

Reproduction: from this checkout, run the pinned Node with `--import tsx C:/Users/sboad/projects/xenios-qa-evidence-astra-b-health-20260907/preview-flags-selftest.mjs` and this checkout path as its argument.

The initial claim that the admin guard required UUID fixture identities was retracted after direct source verification; no UUID patch was made. This preview still substitutes member authentication and in-memory storage, so it is not production-auth or database evidence. Its fixture self/dashboard routes and preview boundaries are not evidence of all production mount behavior.

Next: A selects the one code commit; B executes a fresh browser proof against the frozen combined source and built bundle. Existing production remains unchanged by B.

## Follow-up: deep links from the hidden Codex worktree

Pushed follow-up code: `701fd585fcef9f73523192bd42be8a1d1409169e`, one line in the same preview file. Browser run against A records head `33436c5fba078c8511dcc06749e5820995bee023` stopped before any fixture writes: `/` and built assets passed their byte checks, but `/admin/research/resource-hub` returned Express NotFoundError from the absolute `sendFile` fallback. The `.codex` ancestor encountered default dotfile handling.

The correction is `sendFile('index.html', { root: clientDist })`, keeping the filename fixed and the root explicit. It does not enable dotfiles. Pinned Node 20.19.0 with Express/Supertest against the actual built `.codex` path reproduced old absolute fallback 404, corrected fallback 200, and exact index byte-hash equality. A separately confirmed the scoped design and requested this correction. The failed browser run remains failed evidence, not a production/application regression or a passed journey.
