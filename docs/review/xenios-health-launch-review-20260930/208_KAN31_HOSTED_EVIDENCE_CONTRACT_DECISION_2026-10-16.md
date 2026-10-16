# KAN-31 hosted browser evidence contract: original reviewer decision

**PROTOCOL ACCEPTED, conditionally.** The proposed hosted evidence contract is **sufficient for a stated, weaker
KAN-31 ownership claim**. It does **not** stand in for the lost pre-POST private-pair provenance, and the record must
say so. It is accepted only with the binding conditions in section 3, all of which are mandatory parts of the pass
verdict.

- **Not executable acceptance.** The CI and browser implementation, workflow, credentials and SQL still need their own
  review.
- **Not a qualification.** No browser qualification has occurred.
- **Not authority.** No staging, SQL, credential or production authority is granted.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Delivery.** The packet did not reach this session through the composer. Samuel directed this review in chat, and I
  read Root's frozen packet directly: Doc452 at records `c7a58b4`.
- **Method.** Read-only: Git objects and one source grep; no execution; no agents. E33, the regression evidence, the G0
  diagnosis and Docs 195–207 are closed and not reopened.
- **Timing.** Reviewed at 2026-10-16T01:40–01:53Z.

Archive: `hl12/208_kan31_hosted_evidence_contract_decision.json`.

## 1. Identity

- **Commit.** Core `42fa1d15` (tree `091d193e`, parent `9d5574d2`), local only, adds exactly three documents under
  `hosted-browser-evidence-contract-r1-20261016/`:

| File | Size | Hash |
|---|---|---|
| `HOSTED_PROTOCOL.md` | 8,183 B | `81ffe372…` |
| `BINDING_CONTRACT.md` | 7,048 B | `72ca5de4…` |
| `PROPOSAL.json` | 1,849 B | `30e7cec3…` |

- **Unchanged and not run.** E33 `e33c12a9`/`ab4415f0` is unchanged. No tests, SQL, browser, configuration or push.

## 2. The decision on lost provenance

- **What the old Doc399 contract proved.** It took pre-write, server-bound private owner and attempt hashes as input.
  That proved the stored row's private pair equals the server identity of the actual browser principal and key, which
  is cryptographic attribution.
- **What hosted mode cannot do.** It cannot precompute those hashes without server secrets, and the proposal rightly
  refuses to put them in CI or the browser. **That attribution is lost.** The successor's internal `pair_rows` count
  shows only that the observed pair is unique, which is a weaker claim.
- **Why I judge the replacement sufficient for KAN-31's purpose.** KAN-31's claim is that the customer journey creates
  exactly one correctly attributed pending intent under double-click, lost response and reload. The realistic ways that
  could fail are each caught by a frozen, independent check:
  - **Owner scoping broken**, for example a constant or wrong owner hash: owner B's and anonymous recovery of A's key
    would return a receipt, so the run fails.
  - **Key binding broken**: a changed-facts replay under the same key would return a new reference instead of
    `409 attempt_conflict`, and identical replay would differ, so the run fails.
  - **Attempt hash not distinct per key**: the three scenarios by A would collide. Distinct request UUIDs and references
    are required, so the run fails.
  - **Duplicate creation under retry or reload**, such as session rotation producing a second pair: the retry's
    observed receipt would differ from the first observed upstream response, which `route.fetch()` sees before the
    abort. Same-receipt is required, so the run fails.
  - **Content or fingerprint corruption**: the independently frozen `expected_json` and `expected_fingerprint`
    comparisons fail.
- **What remains genuinely unproven.** That the server's hashing algorithm binds exactly the authenticated principal,
  for every session. That is a property of E33's source, already accepted at source scope, and the behavior checks test
  it empirically. I accept this residual for a staging qualification. It must be stated as a limitation, not claimed as
  proved.
- **Parity on undisclosed attempts.** The original contract also relied on complete browser accounting to exclude
  undisclosed different-key rows, so nothing is lost relative to it there. The proposal says this correctly.

## 3. Binding conditions

These are part of the pass verdict, not suggestions.

1. **Claim wording.** Every KAN-31 record and Jira statement must say "observation-based ownership (behavioral
   A/B/anonymous, replay, 409), no private-pair provenance". Never "equivalent to Doc399".
2. **Compensating checks are mandatory**, after each of the three persisted scenarios:
   - A identical replay returns the identical receipt;
   - A changed-fact same-key returns `409 attempt_conflict` with no new row;
   - A recovers the receipt;
   - B recovery of A's key returns no receipt;
   - anonymous recovery returns no receipt.

   Any missing, skipped or unauthorized check makes the hosted claim **insufficient**, not partially passed.
3. **B must be real.** B is a separately authenticated, distinct eligible synthetic principal, recovery only and never
   a submission. The distinction must be proved from server-side session identity evidence, not browser profiles or
   typed email. Otherwise the B check is vacuous.
4. **Accounting.** Complete settled request accounting covers every POST and recovery and its outcome. Any unresolved
   upstream outcome means no exactly-one verdict.
   - The 409 probe and the identical replay each count as an accounted request.
   - Any unexpected new reference from them is a FAIL.
5. **DB checks.** Fingerprint golden vectors serialized independently, not only the imported E33 helper, are
   **required** in the implementation. The SQL successor must:
   - fail on a missing anchor or a NULL comparison;
   - return `pair_rows = 1`;
   - keep exactly one submitted actor-null event and one total event at the pre-staff snapshot;
   - output `browser_scenario_proved_by_this_query_alone = false`.
6. **Optional strengthening, not required.** The DB owner may, without exposing values, also check that the three
   matched rows share one owner hash and have three distinct attempt hashes. A synthetic-marker duplicate count stays a
   separate scope decision.
7. **Served identity is an executable prerequisite, not decided here.** E33 has no public version route.
   - `/api/health` is liveness only, and `RENDER_GIT_COMMIT` is read by staff-only founder and recovery code.
   - Executable acceptance must name the exact served-identity basis: either Render's API deploy-to-commit association
     plus a reviewed existing staff observation of `RENDER_GIT_COMMIT`, or an explicitly accepted provider-only basis.
   - It must say which. No new runtime route is implied.
8. **Old evidence stays.** The original Doc399 remains a historical, unexecuted template. `G0_CHAIN_FAILED` and the
   consumed local attempt remain separate, and nothing retries them.

## 4. Remaining before any hosted qualification

These are the proposal's own list, which I confirm:

- the DB owner's SQL successor and its source and negative-control review;
- the reviewed exact CI and browser implementation and resource controls, with pinned tools and browser revision;
- the approved staging deploy of E33, since staging still serves `65c9cc54` (Doc 207), with served identity and
  environment readiness verified;
- authorized short-lived synthetic A, B and staff states;
- exact synthetic mutation admission, then separate populated-SQL approval;
- the applicable release checks;
- production authority, which is separate.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | hosted evidence contract (Core 42fa1d15 / tree 091d193e: HOSTED_PROTOCOL 81ffe372, BINDING_CONTRACT 72ca5de4, PROPOSAL 30e7cec3; packet Doc452 c7a58b4) | reviewer 6abf1edf | PROTOCOL ACCEPTED (conditional), NOT executable acceptance or qualification: pre-POST private-pair provenance is LOST and must be stated; replacement is sufficient for a weaker observation-based ownership claim because owner-scoping, key-binding, attempt-distinctness, retry/reload duplication and content failures are each caught by frozen checks. Binding: claim wording (no Doc399 equivalence); mandatory per-scenario A replay / A changed-fact 409 no new row / A recovery / B no receipt / anonymous no receipt (any missing = insufficient); B distinct by server-side identity evidence, recovery only; complete settled accounting, unresolved = no verdict; independent golden fingerprint vectors; SQL fails on missing/NULL, pair_rows=1, one submitted+one total event pre-staff; served identity basis named at executable review (no public version route in E33) | remaining: DB-owner SQL, CI/browser implementation review, approved E33 staging deploy (staging serves 65c9cc54), synthetic A/B/staff auth, mutation + SQL approvals | doc 208.`

Not execution, configuration, credential, deployment, approval or production consent; not human approval.
