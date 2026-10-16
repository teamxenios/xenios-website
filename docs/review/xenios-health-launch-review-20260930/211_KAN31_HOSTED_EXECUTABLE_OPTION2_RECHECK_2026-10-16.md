# KAN-31 hosted executable: Option 2 correction re-check (changed lines only)

**PASS at source scope. The Doc 209 defect is resolved, as the Doc 210 Option 2 basis requires.**

- **Accepted.** Core `050b0409` (tree `6ed2198c`; intermediate `5c0ae2c`; base `870d752f`) is accepted at source
  scope for the hosted executable, together with the unchanged reviewed files from Doc 209.
- **What this is not.** Not execution credit, a qualification or authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: the cumulative diff
`870d752f..050b0409` and E33 client and server auth source; nothing run; no agents. Recorded at 02:35Z.

## Identity

- **Changed files.** Exactly two files change, with 110 lines added and 17 removed:

| File | Size | Hash |
|---|---|---|
| `contracts.mjs` | 9,522 B | `0d94f699…` |
| `hosted-browser.UNAPPLIED.mjs` | 20,777 B | `1f84221e…` |

- **Unchanged.** The workflow (`7115ad88`), `verify-tools` (`85ee0855`) and the handoff (`ced14cca`) are
  unchanged.

## Checks against Doc 210

1. **B's recovery.** `assertNoReceipt` accepts `b-recover` only for `200` with exactly one key, `receipt === null`.
   `401/403` remains accepted only for `anonymous-recover`, and any other role throws.
2. **Live sign-in.** `liveSession` calls `GET /api/research/member/me` and requires `200` with `ok === true`, through
   `assertRelevantAuth`.
   - It runs for A at the start, on a fresh probe page after `settled()`.
   - It runs for B immediately before and immediately after each case's B recovery, and `assertAuthenticatedB`
     re-asserts the triple.
   - The `sessionChecks` evidence records role, point, status, `ok` and `identityCompared:false` only.
3. **Distinctness from behavior.**
   - In each case, A recovers the same native receipt and the authenticated B gets `{receipt:null}` under the same
     key.
   - Each case records `distinctnessBasis:'behavior-only'` and `underlyingCustomerIdentityProved:false`.
   - The static `distinct===true` proof gate is correctly dropped and replaced by `APPROVED_SESSION_INPUTS`.
4. **Regression vectors.** `option2RegressionVectors` is pure, with no fetch, browser or credential, and runs in the
   preflight. It covers:
   - B 401/403 refused;
   - anonymous 401/403 accepted;
   - B 200 with a receipt, extra keys, `{}`, `null` or `[]` refused;
   - five sign-in defects, each before and after, refused.
5. **Claim.** `CLAIM` carries the Doc 210 sentence verbatim.

## Operability and secret handling

- **The UI really uses bearer tokens.** E33 member auth reads `Authorization: Bearer` (`member-auth.ts` 180–181). The
  wizard's request-intent client sends `Authorization: Bearer` (`request-intent-api.ts` 58–60). `core.tsx` calls
  `member/me`.
- **Capture rule.** Capturing the bearer from the UI's own verified `member/me` response is sound, and every A/B
  mutation must carry that same bearer (`SAME_MEMBER_REQUEST_AUTH`).
- **Secret handling.** The bearer is held in memory only, sent only to the pinned origin, never logged or persisted, and
  cleared in `finally`.
- **Fail-closed risk, disclosed.** If the UI refreshes its token during the run, `MEMBER_CREDENTIAL_CHANGED` fails the
  run.
- **Limit.** `member/me` proves a live member sign-in, not the request-intent owner identity. Option 2 accepts this
  explicitly, and the record states it.

## Still reserved

- **GitHub.** Push, and workflow placement.
- **Bindings.** The tool bundle, artifact and versions; principal custody inputs; and an approved E33 staging deploy,
  since staging still serves `65c9cc54`.
- **Served identity.** Explicit acceptance of the provider-only served-identity basis.
- **Database and staff.** The DB owner's SQL successor, then staff readback.
- **Run approval.** Exact mutation admission and window.
- **Production.** Separate.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | hosted executable Option 2 re-check (Core 050b0409 / tree 6ed2198c; contracts 0d94f699, hosted-browser 1f84221e; others unchanged) | reviewer 6abf1edf | PASS at source scope: Doc 209 defect resolved — b-recover only 200 {receipt:null} (401/403 anonymous only); live member/me 200 ok for A at start and B before/after each recovery; distinctness behavior-only, recorded; pure regression vectors; claim updated. E33 member auth and wizard client use Bearer, so capture works; token in memory only; refresh fails closed | still reserved: push/workflow placement, tool bundle, principal inputs, E33 staging deploy, provider-only identity acceptance, DB SQL, mutation admission | doc 211.`

Not execution, configuration, credential, deployment, approval or production consent; not human approval.
