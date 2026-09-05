# Admin access inspection — tested client slice

This checkpoint supplies a read-only diagnostic interface, not approval, invitation, activation or production completion. It consumes ASTRA-A's exact `shared/research/approved-user-access.ts` contract from `27ecc9efbaa8d4bb429195eee46768167e564972`; B's contract-adoption commit is not a feature cherry-pick.

## Implemented

The existing guarded customer roster mounts the diagnostic independently of its own unavailable-data boundary. The whole roster body and diagnostic form are keyed to the current admin credential. Missing plan information is **Not recorded**, never an invented paid membership. Historical plan/payment records are not deleted or changed.

The admin explicitly submits one email. The adapter normalizes and validates it, sends it only in the canonical inspection POST's JSON body, validates the strict response schema and binds the returned email to the submitted email. Typing, mounting and switching accounts do not automatically inspect. Email edits, repeated requests, admin switches and unmounts invalidate prior results. No browser storage or email query parameters are used.

The panel distinguishes identity verification, canonical customer binding, partner requirements and organization-source availability. Unknown organization data is not an empty list. It displays observed source time and server-reported next-step consequences with notification warnings. Only exact returned application/customer UUID paths, or the canonical application entry if supplied, can become navigation links; no link executes an approval or invitation. Partner, referral, Care and product authority remain separate.

## Verification

- Final combined regression: **471/471 tests across 23 files**, exit 0, Node 20.19.0.
- Included diagnostic component tests: 30; new adapter tests: 17; roster integration additionally verifies that unavailable roster data cannot hide diagnosis and null plan data cannot invent paid membership.
- Repository `tsc --noEmit`: exit 0. Client/server production build: exit 0, retaining existing chunk/import warnings. Scoped whitespace check: pass.
- Independent source review found no blocking client defect and independently reran the 17 adapter tests.
- Isolated local visual fixture uses the actual component and adapter with strict synthetic responses. All fetches except its exact same-origin, synthetic-token inspection POST are refused; no real admin/provider session is represented.
- Six browser states checked: absent account, verified customer, partner requirements, conflicting bindings, unavailable inspection, and malformed response. Unavailable/malformed states show no inferred account facts. Reported missing requirements expand correctly.
- Email editing clears the result; a settled A-to-B context switch clears prior information, accepts a new email, and displays only the new inspection. The same sequence has a dedicated regression test. A misleading snapshot input-value observation was not treated as a production defect; visible input and returned-email evidence confirmed the behavior.
- Document containment passed at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320 pixels. Mobile presentation was visually inspected at 390 pixels.

## Boundaries and remaining work

The browser fixture is not proof of live admin authorization, production record completeness, provider ownership, invitation delivery or approval behavior. Those remain ASTRA-A's integration/production gates. Removing paid-membership prerequisites, the approved-customer writer and verified claim flow, historical billing treatment, product readiness and the controlled live purchase remain separate required work. This diagnostic calls none of their mutations.

No production migration, configuration, price activation, deployment, real account approval, communication, purchase or shipment was performed by this slice.
