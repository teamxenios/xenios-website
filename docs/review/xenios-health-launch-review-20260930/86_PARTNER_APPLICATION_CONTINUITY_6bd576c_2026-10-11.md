# Partner application continuity (`6bd576c`): source review

**ACCEPTED WITH NAMED LIMITS.** No P0, P1 or P2.

The form is keyed on the member token, member presence and cart scope. Any identity change deletes the old instance in
the same commit, and React drops late updates sent to a deleted instance. So:
- **Bound to the submitter.** Outcomes stay with the identity that submitted.
- **No identity crossing.** Stale completions cannot cross identity boundaries.
- **A frozen receipt.** The receipt shows the submitted contact snapshot, not later edits.

The contract is preserved:
- **Role and agreement.** The fixed `research_rep` role and pending agreement are unchanged.
- **Endpoint and authorization.** The canonical endpoint and Bearer authorization are unchanged.
- **No implied outcome.** Nothing implies account approval, commission entitlement, verified attribution or email
  delivery.
- **No live traffic in tests.** The tests make no live POST or email.

Nothing was executed, and the authored tests are NOT RUN.

Reviewer: this session, `claude-opus-5-5`. Board task `FULLSITE-PARTNER-APPLICATION-CONTINUITY-20261011-SOURCE-REVIEW`
revision 1, acknowledged at `12b0db1`.

**Target:**
- **Source:** `6bd576c520646295c526366c12abf75a6b5182b2` (tree `16e9afbc…`, parent `71e4cc4`).
- **Records:** `a5271e6a77c04e6ec0b6074cf3c041d41ddaace8`.
- **What changed:** the source changes exactly `client/src/research/pages/partners/Apply.tsx` (blob `26e9d94`) and
  `apply.test.tsx` (blob `63896a0`). The adapter, core and lib files are unchanged.

**Method.** One read-only checker and one adversarial verifier. Output is archived as
`hl12/85_86_client_continuity_reviews.json`.

## Named limits (P3; fold into the next records or source touch)

- **PA-1. Untested guards.** The source-test map credits the tests with proving the attempt-ownership guards, but the
  keyed remount alone produces every cross-identity result. Describe those guards as defensive and untested, or remove
  them.
- **PA-2. A possible stuck form.** The layout-effect cleanup clears the active attempt on any teardown. That can leave
  a mounted form stuck on "Submitting..." (plausible). Remove it and rely on the keyed instance, or surface the existing
  unconfirmed error.
- **PA-3. An untested trim.** The "trimmed receipt email" claim is met by the input's own sanitization, so the
  component's `.trim()` is untested. Drop the claim from the map.
- **PA-4. Mixed identities in the handoff.** The handoff pairs Git blob IDs with working-tree byte counts and hashes
  without labelling which is which. Label the digest domain.
- **PAV-1. Unpinned contract text.** No test pins the pending agreement or the non-approval copy. Narrow the map row,
  or add those assertions.
- **PAV-2. A wider reset than disclosed.** The same-identity reset is wider than token refresh: `USER_UPDATED` and
  `refreshMember` also remount the form and discard drafts. Disclose the full trigger set.

## Next step

Accepted for source. Runtime evidence awaits its applicable qualification. Nothing here authorizes a test run, a push or
deployment.
