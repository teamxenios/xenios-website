# KAN-31 hosted executable source: review against Doc 208

**CHANGES REQUIRED, minimal.** The earliest material defect is that the owner-B no-receipt check can pass vacuously,
which Doc 208 condition 3 forbids. Everything else reviewed conforms at source scope.

- **What this is not.** Not execution credit, a qualification or authority.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Packet.** Doc453 at records `e4c8f9d`.
- **Method.** Read-only: Git objects and E33 source reads; nothing parsed, tested or executed; no agents. The protocol
  itself (Doc 208), E33, the regression evidence and G0 are not reopened.
- **Timing.** Reviewed at 2026-10-16T02:08–02:20Z.

Archive: `hl12/209_kan31_hosted_executable_source_review.json`.

## 1. Identity

- **Commit.** Core `870d752f` (tree `2eff7dfe`, parent `42fa1d15`), local only, adds exactly five files under
  `executable-r1/`. All match the packet:

| File | Size | Hash |
|---|---|---|
| `contracts.mjs` | 6,812 B | `35764a31…` |
| `hosted-browser.UNAPPLIED.mjs` | 18,460 B | `e51b73f9…` |
| `verify-tools.UNAPPLIED.mjs` | 2,262 B | `85ee0855…` |
| `workflow.UNAPPLIED.yml` | 5,194 B | `7115ad88…` |
| `EXECUTION_HANDOFF.md` | 7,579 B | `ced14cca…` |

## 2. Earliest material defect

**Where.** `hosted-browser.UNAPPLIED.mjs`:

- line 179–180, `recover(…, null, 'b-recover')`, accepts `200 {receipt:null}` **or** `401/403` with an error;
- lines 231–232, `B_CURRENT_ELIGIBILITY`, proves B only by reading the catalog.

**Why it is vacuous.** E33's request-intent routes resolve a viewer with `resolveCustomer` without refusing anonymous
callers (`assisted-order/express.ts` 94ff). `/catalog` and `/recover` are reachable without proven B authentication.

- **Expired or invalid B state.** An expired, revoked or invalid B storage state can therefore pass the catalog
  "eligibility" read and then return either `401/403` or `200 {receipt:null}` on recovery. Both are accepted as
  `bNoReceipt`, but nothing then shows that an authenticated, eligible, distinct B was refused.
- **Static proof is not runtime proof.** `identityAdmission` checks only a Root-supplied
  `principalEvidence.authority === 'server-session'` label and state hashes. That proves the bytes, not B's runtime
  session.

**Smallest correction:**

1. For `b-recover`, accept **only** `200` with body exactly `{receipt: null}`. Keep `401/403` acceptance for
   `anonymous-recover` only.
2. Immediately before and after B's recovery attempts in each case, prove at runtime that B's session is authenticated
   and eligible, and is not A's principal.
   - Use an existing E33 endpoint that **refuses anonymous callers** and returns the authenticated identity, compared
     against a value in the frozen `principalEvidence`.
   - Record only a hash, never the identity.
   - If no such existing endpoint exists, say so, and let the reviewer decide before execution. Do not add a runtime
     route.
3. Apply the same runtime proof to A at the start, so the A/B distinction rests on server responses rather than labels.

Only `hosted-browser.UNAPPLIED.mjs`, and if needed `contracts.mjs`, change. The workflow and the tools verifier are
unchanged.

## 3. What conforms at source scope

- **Independent expectations.**
  - `freezeExpected` runs inside the route handler **before** `route.fetch`. It checks contact and lines against the
    frozen plan, and agreement kind and version against the plan.
  - It captures the browser-generated key and a single `acceptedAt` from the actual body, matching the in-flight
    marker.
  - It writes `*.prepost.json` with `beforeUpstream:true`.
  - Expanded lines come from the pinned catalog snapshot (`catalogSha256`), never from the DB.
- **Fingerprint.** E33's sorted-key form uses submitted lines. The golden vectors are independent literals plus the
  SHA-256 known answer `abc`.
- **Required checks, all mandatory before evidence is written.** A identical replay with the same receipt; A
  changed-fact returning `409 attempt_conflict`; A recovery with the same receipt; anonymous returning no receipt.
  B's check is the exception covered by the defect.
- **Request rules.** B can never submit (line 58). Only the request-intent submit and recovery endpoints may mutate.
  Off-origin traffic, redirects and request, post, inflight and byte limits all abort.
- **Lost-response semantics.** The armed case aborts downstream only **after** `route.fetch` completes with a `200`
  native receipt. Retry and remount require identical body and key and the same receipt. `ACTUAL_RESPONSE_LOSS` is
  required.
- **Accounting.** Every request is accounted, with any unresolved one marked `FAILED_OR_UNRESOLVED`. Any failure fails
  the run. `settled()` gates each phase. The case receipts must be distinct.
- **Secrets.**
  - Storage states exist only as `0600` temp files, deleted in an always-run step. They are never written into
    evidence.
  - No HAR, trace or raw exception output. The artifact holds only `*.json` and `*.png`, with 1-day retention.
  - Permissions are `contents: read` and `actions: read`, `persist-credentials` is false, and the actions are
    SHA-pinned.
  - Node 20.19.0 and npm 10.8.2 are checked, and the tool bundle is verified by hash, mode and exact set.
- **Served identity and claim.** Served identity is explicitly provider-only, with an age-limited proof (≤ 5 min) and
  `providerOnlyBasisAccepted`. That basis still needs an explicit acceptance before execution, as Doc 208 condition 7
  requires. The claim string and `privatePairProvenance:false` are recorded, and the 2,048 MiB floor is kept.

## 4. Reserved prerequisites, unchanged

- **Push and placement.** The Core commits must be pushed, and the workflow placed where `workflow_dispatch` can run
  it.
- **Bindings.** The tool bundle, artifact ID and versions; principal proof content; an approved E33 staging deploy
  (staging still serves `65c9cc54`); and the explicit acceptance of the provider-only identity basis.
- **Database.** The DB owner's SQL successor, then staff readback under the real scoped permission after the
  pre-staff snapshot.
- **Run approval.** Exact mutation admission and the execution window.
- **Production.** Separate.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | hosted executable source (Core 870d752f / tree 2eff7dfe; contracts 35764a31, hosted-browser e51b73f9, verify-tools 85ee0855, workflow 7115ad88, handoff ced14cca; packet Doc453 e4c8f9d) | reviewer 6abf1edf | CHANGES REQUIRED (minimal): B no-receipt check can pass vacuously — b-recover accepts 401/403, and B "eligibility" is a catalog read that E33 serves without refusing anonymous (resolveCustomer), so an expired/invalid B state passes. Fix: b-recover accepts only 200 {receipt:null}; prove B (and A) authenticated, eligible and distinct at runtime via an existing anonymous-refusing E33 identity endpoint before/after B recovery (hash only; no new route — if none exists, report before execution). Rest conforms: pre-upstream freeze, independent golden vectors, mandatory replay/409/A-recovery/anonymous, upstream-200-then-abort, full accounting, secret-safe artifacts, pinned tools, provider-only identity flagged for explicit acceptance | doc 209.`

Not execution, configuration, credential, deployment, approval or production consent; not human approval.
