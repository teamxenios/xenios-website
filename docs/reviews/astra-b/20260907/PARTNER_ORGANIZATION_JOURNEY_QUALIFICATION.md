# Partner organization journey qualification

Status: PASS for the bounded client isolation slice. This is not a production release or approval to enable organization intake.

## Source binding

- Implementation commit: `617c165b6793c7e00db8169fa60fb30d14e1601e`
- Implementation tree: `b6f752b8045d5dd6cd63b5e093e3449f81c5a554`
- Parent: `2de7de75440efc8901d6377d4b7c3a36bf8ff428`
- Branch: `codex/xenios-seth-astra-b-20260905`
- Worktree: `C:/Users/sboad/projects/xenios-seth-astra-b-20260905`
- Runtime/test scope: `client/src/research/pages/partners/Organizations.tsx` and `Organizations.test.tsx` only. This document is the third allocated path.

## Verified focused run

Run on 2026-09-07 at 13:21:18 America/Chicago, immediately before committing the tested source. Terminal evidence chunk: `f7a694`.

```powershell
& 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/pages/partners/Organizations.test.tsx --maxWorkers=2
```

```text
RUN  v4.1.10 C:/Users/sboad/projects/xenios-seth-astra-b-20260905
Test Files  1 passed (1)
Tests       33 passed (33)
Start at    13:21:18
Duration    2.72s (transform 347ms, setup 0ms, import 804ms, tests 802ms, environment 893ms)
Exit        0
```

`git diff --check` passed. The implementation commit contains only the two allocated source/test paths.

## Behaviors established

The jsdom suite renders the actual organization page with the existing partner adapter, API envelope and principal-bound resource hook. Only the research session accessor and fetch transport are synthetic. No network, real account, real email, organization grant, or server mutation is involved.

- Normal ready accounts read only the existing organization endpoint using exact bearer, GET, no-store, and same-origin credentials. Signed-out and checking states issue no private request and expose no intake form.
- HTTP 401/403/404/500/501/503, canonical partner denial, and malformed success payloads do not become empty relationship history or enabled intake. Known denial copy is retained without displaying server-provided personal details.
- Successful empty results explicitly do not establish complete organization history. Missing/unknown roles and states are not promoted to Member, Owner, Active, or In review. Recognized active records have a neutral badge, not an eligibility or payout grant.
- Account A to B removes rows and all draft fields before B finishes loading. Token refresh, checking, sign-out, unmount, and A-to-B-to-A invalidate old submission outcomes. Late acceptance, refusal, and failure cannot clear the new account's draft, publish old messages, or trigger a new-account reload.
- The synchronous duplicate-submit latch permits only one pending POST. Required-value failures never submit. An explicit valid submit preserves the exact existing JSON contract and current bearer; it adds no selected account, role, or approval field.
- Existing 503 refusal retains entries and states that recording/creation cannot be confirmed. Transport failure is uncertain, not a false claim that nothing was submitted. No automatic POST retry occurs. The fallback email link is static `team@xeniostechnology.com` with a static subject and no contact fields in its URL.
- A synthetic successful response triggers a fresh server read rather than optimistic creation or role assignment. The page does not promise an email, grant, or approval and does not render arbitrary response messages.

## Server boundary and limits

Source inspection of the existing partner routes confirms that the organization request endpoint still returns 503 `capability_disabled`. This slice does not implement or enable intake. The existing GET projection remains the server's account-scoped relationship authority. The client validates fields it renders; it cannot prove server-side ownership by itself.

No backend, adapter, shared contract, ownership registry, migration, feature flag, Resource Hub, or A-owned integration file changed. No production action, real notification, payment, or user provisioning occurred.

This evidence is a focused synthetic UI/API-contract qualification, not a full TypeScript build, full regression run, rendered real-browser acceptance, live authorization test, or delivery verification. Those release gates remain with the integration coordinator.
