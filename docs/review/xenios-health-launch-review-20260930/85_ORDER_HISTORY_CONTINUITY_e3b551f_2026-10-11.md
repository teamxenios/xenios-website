# Order History continuity (`e3b551f`): source review

**CORRECTIONS REQUIRED: one P2.** The isolation design is sound:
- **No foreign data is shown.** A previous identity's or order's data is never rendered.
- **No stale overwrites.** Stale results cannot overwrite current ones.
- **No tokenless requests.** No request is sent without a token.
- **Nothing invented.** No payment or order status is invented.
- **Authority is unchanged.** The adapter, server and endpoints are untouched.

But both pages now treat a missing token as "your session has ended", even while core is still verifying the session.
That is a false sign-in prompt for signed-in customers (OH-1). The fix is one line per component plus tests. Nothing was
executed, and the authored tests are NOT RUN.

Reviewer: this session, `claude-opus-5-5`. Board task `FULLSITE-ORDER-HISTORY-CONTINUITY-20261011-SOURCE-REVIEW`
revision 1, acknowledged at `12b0db1`.

**Target:**
- **Source:** `e3b551fbe59ae40cb0e5f6d6dcbbf422e566ac6e` (tree `d6ba3583…`, parent `121d098`).
- **Records:** `6a995c56d40b74582f0daf6c05c4ee005ca52592`.
- **What changed:** the source commit changes exactly `client/src/research/orders/OrderHistory.tsx`,
  `OrderHistoryDetail.tsx` and `OrderHistory.session-continuity.test.tsx`, plus continuity records. The blobs match the
  registration.

**Method.** One read-only checker and one adversarial verifier. I confirmed OH-1 in the code myself. Output is archived
as `hl12/85_86_client_continuity_reviews.json`.

## The correction (P2)

**OH-1. A false "session has ended" during session verification.**
- **The defect.** `OrderHistory.tsx:59-60` and `OrderHistoryDetail.tsx:55-56` render the unauthorized state ("Please
  sign in. Your session has ended.") whenever `memberToken` is null.
- **Why it misfires.** Core clears the token while it verifies a session: status `'checking'` at `core.tsx:188`, token
  cleared at `:298`. That happens on hard load, sign-in, token refresh and `USER_UPDATED`.
- **The consequence.** A signed-in customer sees a sign-in prompt until verification finishes.
- **The convention it breaks.** The sibling Dashboard already checks `memberChecking` first (`Dashboard.tsx:241`).
- **The fix.**
  - In both components, read `memberChecking` from `useResearch()`, and derive loading while checking, unauthorized only
    when not checking and there is no token, and otherwise the snapshot match.
  - Keep the rule of no request without a token.
  - Add tests: while `memberChecking` is true with a null token, show loading, don't show "Please sign in.", and send no
    request. Then show the snapshot after checking completes.

## Named limits (P3)

- **OH-2. A real not-found looks transient.** The server's coded 404 `order_not_found` is shown as a transient
  "unavailable", because the canonical adapter (outside this scope) discards the code. Restate the limit precisely in
  the records; telling them apart needs a separately scoped adapter change.
- **OH-3. Pre-existing wording.** The list page's "switched on / nothing is wrong" wording for 403 and 503 is
  pre-existing and unchanged.
- **OH-4 and OHV-1. Mislabelled tests.** Some tests are crash-safety or preservation controls rather than regression
  discriminators. Label them that way in the source-test map.
- **OHV-2. Untrue copy pinned.** A new list test pins that pre-existing "not available yet" copy. Assert only the
  distinction from "No orders yet."
- **OH-5. A memoised identity.** `useMemo` is used as a request identity. This is fail-safe: a discarded cache only
  causes a reload.

## Next step

The same owner makes the OH-1 correction and its tests, on these three paths only, then registers revision 2 for a
bounded check. Nothing here authorizes a test run, a push or deployment.
