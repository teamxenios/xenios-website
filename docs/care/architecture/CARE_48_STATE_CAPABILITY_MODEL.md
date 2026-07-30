# Care 48-State Capability Model

- Status: architecture only
- Default capability: unavailable
- State records created by this document: none

## Scope

The Care state model covers exactly the 48 contiguous United States listed below. Alaska (`AK`) and Hawaii (`HI`) are explicitly excluded. No state is active by default.

The District of Columbia, territories, military postal regions, and any jurisdiction not listed here are outside this 48-state model. They must not be inferred as supported or mapped to a nearby state.

## Exact contiguous-state set

| # | Code | State | # | Code | State |
|---:|:---:|---|---:|:---:|---|
| 1 | AL | Alabama | 25 | NE | Nebraska |
| 2 | AZ | Arizona | 26 | NV | Nevada |
| 3 | AR | Arkansas | 27 | NH | New Hampshire |
| 4 | CA | California | 28 | NJ | New Jersey |
| 5 | CO | Colorado | 29 | NM | New Mexico |
| 6 | CT | Connecticut | 30 | NY | New York |
| 7 | DE | Delaware | 31 | NC | North Carolina |
| 8 | FL | Florida | 32 | ND | North Dakota |
| 9 | GA | Georgia | 33 | OH | Ohio |
| 10 | ID | Idaho | 34 | OK | Oklahoma |
| 11 | IL | Illinois | 35 | OR | Oregon |
| 12 | IN | Indiana | 36 | PA | Pennsylvania |
| 13 | IA | Iowa | 37 | RI | Rhode Island |
| 14 | KS | Kansas | 38 | SC | South Carolina |
| 15 | KY | Kentucky | 39 | SD | South Dakota |
| 16 | LA | Louisiana | 40 | TN | Tennessee |
| 17 | ME | Maine | 41 | TX | Texas |
| 18 | MD | Maryland | 42 | UT | Utah |
| 19 | MA | Massachusetts | 43 | VT | Vermont |
| 20 | MI | Michigan | 44 | VA | Virginia |
| 21 | MN | Minnesota | 45 | WA | Washington |
| 22 | MS | Mississippi | 46 | WV | West Virginia |
| 23 | MO | Missouri | 47 | WI | Wisconsin |
| 24 | MT | Montana | 48 | WY | Wyoming |

Explicitly excluded:

- `AK` — Alaska
- `HI` — Hawaii

The numbering is a documentation aid only and is not a database identity or priority.

## Capability dimensions

Future state capability must be evaluated separately for each Care program version. A state decision is not a single Boolean. It is the conjunction of current, exact evidence in these dimensions:

| Dimension | Required evidence | Blocking condition |
|---|---|---|
| Program authorization | Exact Care program and version approved for review in the state. | Missing, ambiguous, superseded, expired, paused, or cross-program evidence. |
| Medical-group authority | Current agreement and governance relationship for the exact program and state. | No verified relationship or conflicting legal entity. |
| Provider coverage | At least one exact provider with current credentials, active program assignment, and current state authority. | Missing, expired, suspended, unverified, or mismatched provider evidence. |
| External-service coverage | Every externally exposed service has an approved provider and state coverage. | A required scheduling, telehealth, pharmacy, laboratory, support, or incident seam is absent or disabled. |
| Privacy and consent | Approved state-appropriate documents and exact versioned consent flow. | Missing or superseded document, ambiguous applicability, or no current grant. |
| Workflow readiness | Approved eligibility, intake, support, emergency, and incident processes. | Missing predecessor, owner, escalation path, or review approval. |
| Release approval | Server-authoritative state activation decision by an authorized reviewer. | No approval, browser-only state, stale approval, or kill switch engaged. |

## State capability lifecycle

Allowed architecture states:

1. `unassessed` — no complete evidence set has been reviewed.
2. `under_review` — evidence is being collected or reviewed; Care remains unavailable.
3. `blocked` — one or more required facts are missing, rejected, expired, ambiguous, or incompatible.
4. `ready_for_activation_review` — software and required evidence appear complete; Care remains unavailable pending a separate activation decision.
5. `active` — reserved for a future explicit server-authoritative activation after every gate passes.
6. `paused` — prior activation is suspended; new Care actions are unavailable.
7. `disabled` — capability is administratively disabled or killed.

Only `active` could permit a future Care action. This document neither creates nor authorizes an `active` state.

### Transition rules

- `unassessed` may move only to `under_review`.
- `under_review` may move to `blocked` or `ready_for_activation_review`.
- `blocked` may return to `under_review` only after new evidence is entered; it cannot skip review.
- `ready_for_activation_review` may move to `blocked` when any evidence changes, expires, or conflicts.
- Activation requires a separate protected release process outside this architecture unit.
- `active` must immediately become `paused` or `disabled` when a governing fact is revoked, expires, becomes ambiguous, or fails revalidation.
- No client, query string, local state, role claim, or prior success may cause a transition.

## Exact evaluation algorithm

For an exact patient location, exact program, and exact requested action:

1. Normalize the jurisdiction using an authoritative server-side address result.
2. Reject `AK`, `HI`, blank, conflicting, foreign, territory, military, or unrecognized jurisdiction values.
3. Require membership in the exact 48-state set above.
4. Load the current capability for the exact state and program version.
5. Lock or otherwise serialize all governing evidence used by the decision.
6. Require every capability dimension to be current and verified.
7. Require the exact provider, where applicable, to satisfy all dimensions for the same state and program.
8. Revalidate before replay and before every exposure-increasing transition.
9. Return unavailable without protected details when any check fails.

## No inference rules

The model must not infer state capability from:

- a provider's mailing address, residence, profile completeness, or authority in another state;
- another provider's license, coverage, agreement, or availability;
- coverage for a different Care program or version;
- a Research member's address, order destination, or prior purchase without authorized Care location verification;
- an earlier appointment, consent, prescription, laboratory, or support event;
- a default national flag or a count of covered states;
- Alaska or Hawaii adjacency, shipping availability, or provider willingness;
- the absence of a blocker record.

## Privacy and observability

Public responses may state only that Care is unavailable or that coverage cannot be confirmed. They must not expose:

- provider identities or credential details;
- legal review, agreement, or evidence records;
- exact internal blocker keys;
- another state's capability;
- patient location evidence;
- confidential support or incident contacts.

Internal audit should record opaque identifiers, decision category, evidence versions, and timestamps without PHI or credential contents.

## Related architecture

- [GLP Care and Quantum EV boundaries](GLP_CARE_AND_QUANTUM_EV_BOUNDARIES.md)
- [Confidential provider roster](CONFIDENTIAL_PROVIDER_ROSTER.md)
- [Care workflow state machine](CARE_WORKFLOW_STATE_MACHINE.md)
- [Care privacy test matrix](CARE_PRIVACY_TEST_MATRIX.md)
