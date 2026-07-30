# GLP Care and Quantum EV Boundaries

- Status: architecture only
- Activation state: disabled
- Clinical or provider authority: not established by this document

## Purpose

This document defines the separation boundary for future GLP Care and Quantum EV software. It does not activate a clinical program, establish treatment availability, identify a provider, authorize a jurisdiction, or create a patient workflow.

GLP Care and Quantum EV are distinct Care program identities. Neither program is a product, variant, offer, price, lot, certificate, inventory position, or availability state in the Xenios Research catalog.

## Non-negotiable separation

| Boundary | Required behavior | Fail-closed behavior |
|---|---|---|
| Program identity | GLP Care and Quantum EV use separate Care-owned program identifiers and independent readiness decisions. | A missing, duplicated, aliased, or ambiguous program identifier blocks display, enrollment, scheduling, clinical action, and provider action. |
| Research catalog | Research catalog records may never supply clinical identity, eligibility, instructions, provider authority, jurisdiction, or activation. | A catalog-only match is treated as no Care program match. |
| Provider authority | Provider participation requires a verified confidential provider record, current credentials, exact program assignment, and exact jurisdiction coverage. | Missing, expired, rejected, superseded, mismatched, or ambiguous evidence blocks the provider and every dependent workflow. |
| Jurisdiction | Coverage is determined independently for the exact program, provider, and patient location under the [48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md). | Unknown location, Alaska, Hawaii, an unlisted jurisdiction, or conflicting coverage blocks eligibility and every successor state. |
| Workflow lineage | Every transition requires the exact current predecessor and the same patient, program, jurisdiction, provider, and evidence lineage. | Missing or incompatible lineage rejects the transition without revealing or mutating protected state. |
| Privacy | Care data remains separate from Research membership, catalog, commerce, analytics, and support data unless a future reviewed consent explicitly authorizes a minimum necessary exchange. | No consent or an ambiguous consent means no exchange. |
| External action | Scheduling, messaging, laboratory, pharmacy, prescribing, fulfillment, notification, and escalation providers remain disabled until separately configured and approved. | An absent or disabled provider records no external action and must not simulate success. |

## Independent program identity

Future implementation must use a Care-owned program identity object with, at minimum:

- an opaque program identifier;
- a program family (`glp_care` or `quantum_ev`);
- an immutable version;
- a lifecycle state;
- a clinical governance evidence reference;
- a jurisdiction capability reference;
- a provider assignment policy reference;
- a privacy and consent bundle reference;
- an incident and emergency-boundary reference;
- verification and expiration metadata;
- a release decision made by an authorized Care reviewer.

These fields are a contract shape, not populated facts. This document supplies no provider, treatment, product, dose, formulation, price, state coverage, or availability value.

### Forbidden identity fallbacks

A future implementation must not derive Care program identity or authority from:

- a Research product name, family, slug, SKU, catalog number, image, price, or status;
- a Research product request or member interest record;
- a supplement, diagnostic, or metabolic-pathway presentation;
- a supplier, inventory, lot, certificate, or shipping record;
- free text, URL parameters, local storage, browser flags, or client claims;
- similarity, fuzzy matching, aliases, or a default program;
- the existence of a user, member, order, payment, or prior Care event.

## Required readiness evidence

Each program independently requires reviewed evidence in all of these lanes:

1. **Program governance** — exact program version, accountable governance owner, scope, approved content, and review expiry.
2. **Provider authority** — confidential provider identity, credential verification, program assignment, and active agreement.
3. **Jurisdiction** — exact state capability and current provider coverage for that program.
4. **Privacy and consent** — current approved documents and exact patient grant lineage.
5. **Workflow safety** — approved eligibility, intake, scheduling, support, emergency, and incident processes.
6. **External providers** — actual configured providers for every external action the program would expose.
7. **Operational review** — explicit activation approval and a server-authoritative launch decision.

Readiness in one lane cannot satisfy another. Readiness for one program cannot satisfy the other program.

## Fail-closed decision rule

For every request, transition, replay, or read that could expose protected Care state:

1. resolve the exact program without fallback;
2. resolve the exact current patient and location from authorized server context;
3. resolve the exact confidential provider assignment, when required;
4. revalidate credentials, agreement, program assignment, and jurisdiction at the time of use;
5. revalidate the exact predecessor and consent lineage;
6. reject missing, ambiguous, expired, superseded, paused, or conflicting facts;
7. return a stable, non-sensitive unavailable response;
8. perform no downstream action and reveal no protected record on rejection.

## Prohibited outcomes

This architecture must never be used to:

- present a clinician, medical group, pharmacy, laboratory, or supported state as real;
- imply diagnosis, prescribing, treatment, eligibility, safety, availability, or a treatment result;
- convert Research catalog data into a Care offering;
- create a public Care price, product, checkout, order, or fulfillment path;
- provide a dose, protocol, patient instruction, or treatment recommendation;
- enable a Care route, capability, provider, feature flag, or external notification;
- seed patient, clinician, pharmacy, appointment, prescription, laboratory, or treatment records.

## Related architecture

- [Care 48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md)
- [Confidential provider roster](CONFIDENTIAL_PROVIDER_ROSTER.md)
- [Care workflow state machine](CARE_WORKFLOW_STATE_MACHINE.md)
- [Care privacy test matrix](CARE_PRIVACY_TEST_MATRIX.md)
