# Care Privacy Test Matrix

- Status: architecture-only test plan
- Production data used: none
- External actions performed: none

## Test-data rule

All future tests must use disposable, clearly synthetic records with opaque identifiers. Test fixtures must not contain names, contact details, license numbers, credential documents, patient facts, PHI, supplier costs, real provider data, real program availability, or real jurisdiction coverage.

Logs and assertions use stable categories and opaque IDs only. A failure message must never include a raw record, request body, document, token, credential, or full file.

## Required matrix

| ID | Area | Scenario | Expected result |
|---|---|---|---|
| PRIV-001 | Public boundary | Anonymous visitor requests provider readiness. | Stable unavailable response; no provider identity, credential, agreement, or evidence detail. |
| PRIV-002 | Public boundary | Anonymous visitor probes sequential provider identifiers. | Enumeration-safe identical responses; no existence signal. |
| PRIV-003 | Public boundary | Research member attempts Care roster access. | Denied before repository access; no Care record returned. |
| PRIV-004 | Public boundary | Commerce, affiliate, supplier, or support role attempts roster access. | Denied; no role substitution or shared-data fallback. |
| PRIV-005 | Confidential roster | Authorized decision service resolves one exact provider. | Receives only opaque decision projection, never the full roster record. |
| PRIV-006 | Confidential roster | Profile, license, coverage, and agreement belong to different providers. | Unavailable; facts are not aggregated across providers. |
| PRIV-007 | Confidential roster | Credential is expired, revoked, rejected, superseded, or ambiguous. | Provider unavailable; dependent reads, writes, and replays fail closed. |
| PRIV-008 | Confidential roster | Exact credential value appears in an error or log candidate. | Value is rejected or redacted; test fails if the value is emitted. |
| PRIV-009 | Program isolation | Research catalog identity resembles a GLP Care program. | No Care identity match; no readiness or availability inferred. |
| PRIV-010 | Program isolation | Research catalog identity resembles Quantum EV. | No Care identity match; no readiness or availability inferred. |
| PRIV-011 | Program isolation | GLP Care evidence is submitted for a Quantum EV workflow. | Rejected without mutation or protected replay result. |
| PRIV-012 | Program isolation | Quantum EV evidence is submitted for a GLP Care workflow. | Rejected without mutation or protected replay result. |
| PRIV-013 | Program identity | Program identifier is missing, duplicated, aliased, or ambiguous. | Program unavailable; no default or fuzzy match. |
| PRIV-014 | State model | Each exact contiguous-state code is evaluated once. | Exactly 48 unique codes; none active without complete verified evidence. |
| PRIV-015 | State model | `AK` is supplied. | Explicitly outside model; eligibility and successor actions unavailable. |
| PRIV-016 | State model | `HI` is supplied. | Explicitly outside model; eligibility and successor actions unavailable. |
| PRIV-017 | State model | District of Columbia, territory, military, foreign, blank, or malformed jurisdiction is supplied. | No inference or nearest-state mapping; unavailable. |
| PRIV-018 | State model | Provider is authorized in another state only. | Exact requested state remains unavailable. |
| PRIV-019 | State model | Coverage is current for the other Care program. | Exact requested program remains unavailable. |
| PRIV-020 | State model | State capability changes after an earlier success. | Replay and forward transitions fail closed; exposure-reducing action remains possible. |
| PRIV-021 | Workflow | Required predecessor is missing or version-mismatched. | Stable conflict; zero workflow or event mutation. |
| PRIV-022 | Workflow | Predecessor belongs to another patient. | Denied without revealing the other workflow. |
| PRIV-023 | Workflow | Predecessor belongs to the other Care program. | Denied; no cross-program transition. |
| PRIV-024 | Workflow | Consent is revoked or required document is superseded after workflow creation. | Read, replay, and forward mutation revalidate and fail closed. |
| PRIV-025 | Workflow | Provider credential or program assignment is revoked after assignment. | Forward actions and replay fail; authoritative revocation succeeds. |
| PRIV-026 | Workflow | Idempotency key is replayed by another actor. | Denied; no protected prior result and no mutation. |
| PRIV-027 | Workflow | Idempotency key is replayed with changed patient, program, action, payload, or version. | Denied; no protected prior result and no mutation. |
| PRIV-028 | Workflow | Identical authorized replay occurs while all authority is current. | Returns the same permitted result with no duplicate event. |
| PRIV-029 | Concurrency | Workflow command acquires locks before credential revocation. | Revocation subsequently succeeds; saved workflow becomes stale. |
| PRIV-030 | Concurrency | Credential revocation commits before workflow command. | Workflow command fails with zero forward mutation. |
| PRIV-031 | Concurrency | State or program pause races a forward transition in both orderings. | No stale action commits after authoritative pause; pause is never vetoed. |
| PRIV-032 | Consent privacy | Care consent is absent but Research acceptance exists. | No Care consent inferred; workflow unavailable. |
| PRIV-033 | Consent privacy | Care consent exists for another program or version. | No substitution; workflow unavailable. |
| PRIV-034 | Data separation | Care repository query executes in ordinary Research context. | Zero Care records; no analytics or cache contamination. |
| PRIV-035 | Data separation | Care data is considered for Research commerce, affiliate, fulfillment, or supplier metrics. | Excluded; test fails on any contribution. |
| PRIV-036 | Data separation | Research order or address is offered as Care location authority. | Rejected unless a future reviewed Care process independently verifies it. |
| PRIV-037 | External actions | Scheduling, messaging, laboratory, pharmacy, notification, or escalation provider is absent or disabled. | No outbound call; stable unavailable result. |
| PRIV-038 | External actions | Test provider is configured in capture mode. | Event is captured only in disposable isolation; no external recipient. |
| PRIV-039 | Emergency boundary | User reports an emergency through a future Care surface. | Truthful emergency boundary shown; no diagnosis or treatment advice generated. |
| PRIV-040 | Audit | Successful authorized transition records an event. | Exactly one append-only event with opaque IDs and redacted category. |
| PRIV-041 | Audit | Audit insert fails. | Protected transition fails atomically; downstream handler is not called. |
| PRIV-042 | Audit | Actor account is deleted under a reviewed redaction lifecycle. | Audit survives with only the permitted actor-reference redaction; other fields unchanged. |
| PRIV-043 | Audit | Arbitrary audit update or delete is attempted. | Rejected; append-only history preserved. |
| PRIV-044 | Browser privacy | Protected Care response is cached, indexed, or placed in browser storage. | Test fails; protected responses require reviewed no-store/noindex behavior. |
| PRIV-045 | Browser privacy | Error surface receives adapter or provider error text. | Stable safe copy only; no technical or protected details. |
| PRIV-046 | Accessibility | Unavailable, pending, error, and disabled states are tested at 1440, 720, 375, 320, keyboard-only, and 200% reflow. | One main and H1, no overflow, visible focus, readable status, and no dead control. |
| PRIV-047 | Secret scan | Source, docs, bundles, logs, and evidence are scanned. | Zero secrets, credentials, roster records, PHI, or supplier costs. |
| PRIV-048 | Production safety | Architecture PR is inspected for runtime effects. | No routes, migrations, tables, grants, providers, flags, environment changes, rows, or activation. |

## 48-state coverage invariant

The state-set test must assert:

- count equals 48;
- every code is unique;
- the set exactly equals the codes in [Care 48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md);
- `AK` and `HI` are absent and explicitly rejected;
- no unlisted jurisdiction is normalized into the set;
- every state starts unavailable in a disposable environment;
- capability for GLP Care and Quantum EV is evaluated independently.

## Restricted-marker scan

The documentation and future fixtures must fail validation if they contain:

- a real or plausible clinician/provider name paired with a Care role;
- a license, credential, registration, or national identifier;
- a patient name, contact, address, date of birth, diagnosis, laboratory value, prescription, or other PHI;
- a supplier cost or confidential commercial term;
- a provider secret, token, password, key, or connection string;
- language claiming a real provider, state, appointment, treatment, prescription, laboratory, pharmacy, or availability.

Terms describing fields and negative test cases are permitted only when no value or operational claim is supplied.

## Test execution phases

1. **Static architecture validation** — links, exact state-set count, forbidden record/value scan, and scope diff.
2. **Unit contracts** — pure program, jurisdiction, provider, predecessor, privacy, and error projections.
3. **Disposable persistence** — apply twice, forced RLS, zero browser grants, direct-DML denial, append-only audit, rollback zero.
4. **Concurrency** — explicit barriers for both workflow-first and authority-writer-first orderings.
5. **Browser states** — truthful loading, pending, unavailable, error, disabled, success-without-clinical-claim, responsive, and keyboard evidence.
6. **Integration** — route parity, server authorization, provider capture/disabled modes, no external action.
7. **Post-deploy read-only verification** — exact SHA, capability disabled, zero Care records, safe headers, route denial, logs, and no data leakage.

Phases 2 through 7 are future obligations. This architecture-only unit performs phase 1 and does not create runtime or production state.

## Related architecture

- [GLP Care and Quantum EV boundaries](GLP_CARE_AND_QUANTUM_EV_BOUNDARIES.md)
- [Care 48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md)
- [Confidential provider roster](CONFIDENTIAL_PROVIDER_ROSTER.md)
- [Care workflow state machine](CARE_WORKFLOW_STATE_MACHINE.md)
