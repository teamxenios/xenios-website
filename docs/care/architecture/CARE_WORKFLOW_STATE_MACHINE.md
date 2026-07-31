# Care Workflow State Machine

- Status: architecture only
- Runtime implementation: none
- External actions: disabled

## Safety objective

The Care workflow is a guarded state machine, not a sequence of pages. Every exposure-increasing transition requires an exact current program, patient, jurisdiction, provider authority, consent lineage, predecessor, and action authorization.

Missing or ambiguous facts fail closed. A prior successful decision or an idempotency key is never sufficient authority.

## Global control states

These states govern every future Care workflow:

| State | Meaning | Permitted behavior |
|---|---|---|
| `disabled` | Care is not available. | Truthful unavailable information only; no workflow creation or external action. |
| `architecture_only` | Software contracts are being documented or built without operational authority. | Internal review of architecture and tests only. |
| `pending_external_inputs` | Required program, provider, jurisdiction, privacy, or service facts are incomplete. | Exact required-input review only; no patient workflow. |
| `ready_for_release_review` | Software and evidence appear complete. | Protected human review; still no patient workflow. |
| `active` | Reserved for future explicit server-authoritative activation. | Only actions independently allowed by every lower-level guard. |
| `paused` | New actions are suspended. | Exposure-reducing actions and approved support only. |
| `killed` | Emergency stop is engaged. | No new exposure; incident containment and approved audit only. |

This architecture unit leaves the global control state `disabled`.

## Patient-workflow states

The following are future software states, not claims that a patient workflow exists:

1. `not_started`
2. `location_review_pending`
3. `jurisdiction_unavailable`
4. `identity_review_pending`
5. `consent_pending`
6. `intake_pending`
7. `eligibility_review_pending`
8. `provider_assignment_pending`
9. `scheduling_pending`
10. `scheduled`
11. `checked_in`
12. `clinical_review`
13. `information_requested`
14. `laboratory_information_requested`
15. `decision_recording_pending`
16. `approved_for_next_step`
17. `declined`
18. `no_treatment`
19. `follow_up_pending`
20. `completed`
21. `cancelled`
22. `paused`
23. `closed`

State names describe workflow posture, not diagnosis, treatment, prescription, availability, or a clinical outcome.

## Transition guard

Every exposure-increasing transition must run this guard before idempotent replay and before mutation:

1. **Global control** — exact Care capability is `active`, not paused or killed.
2. **Program identity** — exact GLP Care or Quantum EV program and version resolve without fallback.
3. **Patient ownership** — patient identity comes from authorized server context and matches the workflow.
4. **Jurisdiction** — exact current patient location and active program capability pass the [48-state model](CARE_48_STATE_CAPABILITY_MODEL.md).
5. **Provider authority** — when required, one exact confidential provider satisfies every current identity, credential, agreement, program, state, and action check.
6. **Consent lineage** — exact current approved document versions and latest same-patient grants match workflow bindings.
7. **Predecessor** — stored state, version, required event, and evidence hashes exactly match the canonical predecessor.
8. **Input equivalence** — actor, action, entities, payload hash, and expected version match any replay.
9. **External provider mode** — an external action is allowed only when its exact provider is configured, approved, and enabled.
10. **Audit availability** — the immutable redacted audit write can succeed in the same atomic boundary.

Any failure returns a stable, non-sensitive denial with zero forward mutation and no protected replay result.

## Canonical transition families

| From | Action | To | Required additional evidence |
|---|---|---|---|
| `not_started` | begin location review | `location_review_pending` | Authorized patient context; no inferred location. |
| `location_review_pending` | record unavailable jurisdiction | `jurisdiction_unavailable` | Exact fail-closed jurisdiction decision. |
| `location_review_pending` | continue identity review | `identity_review_pending` | Exact active state capability for the exact program. |
| `identity_review_pending` | request consent | `consent_pending` | Identity review completed; current approved documents. |
| `consent_pending` | begin intake | `intake_pending` | Exact latest same-patient grants for every required document. |
| `intake_pending` | submit for review | `eligibility_review_pending` | Locked intake version and unchanged consent/jurisdiction. |
| `eligibility_review_pending` | request assignment | `provider_assignment_pending` | Human review; no automated clinical decision. |
| `provider_assignment_pending` | assign exact provider | `scheduling_pending` | Exact-provider readiness for program, state, role, and action. |
| `scheduling_pending` | schedule | `scheduled` | Configured scheduling seam; no fabricated appointment. |
| `scheduled` | check in | `checked_in` | Current appointment, time rule, consent, state, and provider authority. |
| `checked_in` | begin review | `clinical_review` | Assigned provider authority revalidated. |
| `clinical_review` | request information | `information_requested` | Human provider action and scoped request. |
| `clinical_review` | request laboratory information | `laboratory_information_requested` | Approved laboratory seam; no fabricated order or result. |
| `clinical_review` | record decision posture | `decision_recording_pending` | Human clinical review; no AI final decision. |
| `decision_recording_pending` | approve next step | `approved_for_next_step` | Exact human authority and required evidence. |
| `decision_recording_pending` | decline | `declined` | Exact human authority and non-sensitive patient communication. |
| `decision_recording_pending` | record no-treatment result | `no_treatment` | Exact human authority; no implicit treatment recommendation. |
| eligible non-terminal state | cancel | `cancelled` | Authorized actor and immutable reason category. |
| any active state | pause | `paused` | Safety, privacy, credential, jurisdiction, provider, or patient-request rule. |
| terminal or resolved state | close | `closed` | Required audit, support, and incident obligations complete. |

The table is intentionally incomplete for operational use. A future implementation must define exact actor matrices, timing, evidence, replay, cancellation, and correction rules before any state can be enabled.

## GLP Care and Quantum EV isolation

- A GLP Care workflow cannot transition into a Quantum EV workflow.
- A Quantum EV workflow cannot inherit a GLP Care provider, credential, jurisdiction, consent, decision, instruction, or event.
- Cross-program references are rejected rather than normalized.
- A patient may have separate workflows only when each is independently authorized and isolated.
- Closing, pausing, or revoking one program must not silently alter the other, but shared governing evidence revocation must independently re-block both when applicable.

## Exposure-reducing behavior

When authority becomes stale, future implementation may preserve narrowly scoped safety exits:

- cancel a pending workflow;
- revoke consent;
- withdraw a patient request;
- pause or close access;
- record an incident or quality concern;
- retain immutable history;
- provide truthful emergency guidance and approved support information.

Exposure-reducing behavior must still verify actor and ownership and must not reveal unrelated protected state.

## Idempotency and concurrency

Future command boundaries must:

- lock the governing workflow and evidence in one documented order;
- reauthorize before returning a replay result;
- bind idempotency to exact actor, patient, program, action, entities, payload hash, and expected version;
- reject cross-actor, cross-patient, cross-program, mismatched-payload, stale-version, and post-revocation replay;
- append exactly one immutable redacted event for a successful command;
- prove both race orderings for credential, consent, jurisdiction, program, and provider invalidation;
- allow authoritative revocation to succeed; a saved workflow cannot veto it.

## Stable non-sensitive outcomes

Potential categories:

- `care_disabled`
- `program_unavailable`
- `jurisdiction_unavailable`
- `authorization_unavailable`
- `consent_not_current`
- `predecessor_not_current`
- `provider_unavailable`
- `external_service_unavailable`
- `workflow_conflict`

These categories must not reveal which credential, provider, agreement, patient fact, or internal evidence failed.

## Related architecture

- [GLP Care and Quantum EV boundaries](GLP_CARE_AND_QUANTUM_EV_BOUNDARIES.md)
- [Care 48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md)
- [Confidential provider roster](CONFIDENTIAL_PROVIDER_ROSTER.md)
- [Care privacy test matrix](CARE_PRIVACY_TEST_MATRIX.md)
