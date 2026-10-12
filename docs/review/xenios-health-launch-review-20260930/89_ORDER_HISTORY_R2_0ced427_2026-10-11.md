# Order History revision 2 (`0ced427`): bounded check of OH-1

**OH-1 CORRECTED. ACCEPTED WITH NAMED LIMITS.** No P0, P1 or P2.

Both components now:
- read `memberChecking` from `useResearch()`;
- show loading while checking;
- show the sign-in prompt only once checking has finished and there is no token;
- never send a read while checking or without a token.

`memberChecking` is part of the request identity (`OrderHistory.tsx:52-65@0ced427`, which I read myself, and
`OrderHistoryDetail.tsx`).

The new tests cover both pages:
- checking with a null token shows loading, not "Please sign in.", with no read;
- account A, then checking, then the refreshed A' shows no sign-in flash and no stale data.

Reasoned against `e3b551f` and against the likely partial fixes, they discriminate: a missing guard, a missing identity
field or a missing render branch.

The doc 85 isolation and authority properties are untouched: render-time identity matching, the per-lifetime active
flag, the StrictMode control and the safe catch. The adapter, core, kit and server are unchanged. Nothing was executed,
and the authored tests are NOT RUN.

Reviewer: this session, `claude-opus-5-5`. Board task `FULLSITE-ORDER-HISTORY-CONTINUITY-20261011-SOURCE-REVIEW`
revision 2, acknowledged at `c3e7337`. Controlling review: doc 85 (`f56d261`).

**Target:**
- **Source:** `0ced42736335f33f4b74c99c98455a621dd7ffed`. Its parent is the revision 1 records commit `6a995c5`, which
  is records only, so the code diff against `e3b551f` is unchanged.
- **Records:** `d30d5b7e9cec08e40b06b2d2347c3e1e867ffc24`.
- **What the source changes:** exactly the three scoped paths plus continuity records. The blob IDs, tree IDs and byte
  counts match the registration.

**Method.** One read-only checker and one adversarial verifier. Output is archived as
`hl12/88_91_bounded_package_reviews.json`.

**Doc 85's precision items are met.** OH-4 and OHV-1 are labelled accurately, and OHV-2 no longer pins the untrue "not
available yet" copy.

## Named limits (P3; records, or the next bounded touch)

- **OR-1. The records overclaim one test.** The source-test map says the `test:343` reject variant catches removal of
  the catch-path publish guard. It cannot, because render-time matching hides the stale write while B is pending.
  Restate that row in the records; the source comment is already accurate.
- **ORV-1. The new test pins untrue copy.** `test:211` pins the kit's "Your session has ended." That is the pattern
  OHV-2 removed, and the copy is untrue for a visitor who never had a session. On the next touch, drop the assertion
  or assert the unauthorized state instead.
- **OR-2. Carried copy limit.** After checking, `verification_failed` (a network failure or a coded denial) is also
  shown as "Your session has ended". This existed before and matches `AccountOrderDetail`. Changing it is a separately
  scoped decision.
- **ORV-2. A narrow core path can leave loading forever (core-owned, plausible).** On hydration with a persisted
  recovery-grade token, core can leave the status at `checking` indefinitely, so this page then shows loading forever
  where it used to show a sign-in prompt. This fails safe: no data and no false success. Carry it as a core limit.
- **Carried from doc 85:** OH-2, OH-3 and OH-5.

## Next step

Accepted for source. Runtime evidence awaits its applicable qualification. Nothing here authorizes a test run, a push or
deployment.
