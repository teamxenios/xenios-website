# Products session continuity (`603af3d`): source review

**ACCEPTED WITH NAMED LIMITS.** No P0, P1 or P2.

The fix uses two independent barriers:
- **A lifetime flag.** It drops an obsolete reply before it is adapted or stored (`Products.tsx:52`).
- **A render-time request-identity mask.** It hides any earlier request's snapshot in the same render that changes the
  context (`:86`).

**What holds:**
- **No read while checking or tokenless.** The page never reads while `memberChecking` is set or without a token
  (`:49`).
- **Retries.** They advance only the current request (`:91-96`).
- **Revisits.** An A → B → A revisit does not revive the first request.
- **No foreign catalog.** After a context change, no prior identity's catalog is shown.
- **Unchanged mappings.** The ok, unauthorized, unavailable, error and empty mappings match the parent exactly, and
  price and eligibility code is untouched.

**Tests.** They catch removal of each main barrier. The StrictMode control is the strongest, since it is the only case
where the identity mask alone would let obsolete data through.

Nothing was executed, and the authored tests are NOT RUN.

Reviewer: this session, `claude-opus-5-5`. Board task `FULLSITE-PRODUCTS-SESSION-CONTINUITY-20261011-SOURCE-REVIEW`
revision 1, acknowledged at `c3e7337`.

**Target:**
- **Source:** `603af3dce672ed2e35fbd9e706b6afe55341df90`, built on D56C2 `3638709`.
- **Records:** `ca318e61accf230302c1e3f7ae2eac473eed81e8`.
- **What the source changes:** exactly `client/src/research/pages/member/Products.tsx` and
  `Products.integration.test.ts`. Every D56C2 path and dependency is byte-identical to `3638709`.

**Method.** One read-only checker and one adversarial verifier. Output is archived as
`hl12/88_91_bounded_package_reviews.json`.

**Not duplicated.** D56C2's review is doc 90; its integration condition DC-1 also applies to this tree, because it
contains D56C2.

## Named limits (P3)

- **PC-1. An adaptation fault is shown as a connection failure.** The new catch runs only when `adaptMemberCatalog`
  throws, because `getMemberCatalog` never rejects (`lib/api.ts:146-148`). The page then shows "The connection failed.
  Please try again.", although the records say "fixed generic error". No data is exposed. This is a net improvement on
  the parent, which spun forever.
  - **Fix:** show the generic line, or classify the fault as unavailable, and update `test:418`.
- **PC-2 and PCV-1. One guard can never fail.** The catch-path lifetime check at `:70` can never be false today. An
  obsolete reply returns at `:52` before anything that can throw.
  - **Fix:** document it as protection against a future rejecting `apiGet`, or add a control that mocks
    `getMemberCatalog` to reject after A → B.
  - **The checker's proposed adaptation-throw control would not catch its removal.** Don't add it.
- **PC-2 and PCV-2. The witnesses overstate.** The PC-03, PC-05 and PC-06 witnesses claim more than the controls show.
  In several legs the read is blocked by `:49` or by React ignoring updates after unmount, not by the retry guard. The
  retry guard is isolated only by `:289-291`/`:298`, `:271`/`:276`, `:321-322` and `:335-338`. Narrow the witnesses in
  the records.
- **No route-level evidence.** Every control renders Products directly in a synthetic context, without
  `RequireMember`. In production, Products' own checking and null branches are defence in depth behind
  `RequireMember`.
- **PC-3 is rejected.** The claim that a previous user's search text survives an in-place identity switch is
  unreachable in the routed app. `RequireMember` unmounts Products while checking and when there is no member, and core
  routes every identity change through checking.

**Process note.** The records disclose that both local commits ran with `core.hooksPath` pointed at an absent
directory, so no repository hooks ran.

## Next step

Accepted for source. Runtime evidence awaits its applicable qualification. Nothing here authorizes a test run, a push or
deployment.
