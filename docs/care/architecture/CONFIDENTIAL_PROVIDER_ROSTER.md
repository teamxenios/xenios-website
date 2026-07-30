# Confidential Provider Roster

- Status: architecture only
- Roster records in this file: **zero**

## Confidentiality notice

This document defines a future confidential-provider boundary. It intentionally contains no clinician names, provider roster records, license numbers, credential documents, contact details, agreements, signatures, patient information, PHI, supplier information, or costs.

Provider facts must be entered only through a future reviewed confidential workflow. Source code, documentation, issues, pull requests, logs, screenshots, browser bundles, analytics, and public APIs are not provider-roster storage.

## Purpose

A future Care workflow may use a confidential provider record only to answer a narrow server-side question:

> Is this exact provider currently authorized for this exact Care program, jurisdiction, role, and action?

The roster is not a public directory, a marketing surface, proof of Care availability, or a substitute for credential verification.

## Conceptual record contract

The following describes required categories, not populated data:

| Category | Minimum future fields | Handling rule |
|---|---|---|
| Identity | Opaque provider ID; confidential legal-identity evidence reference; provider type. | Never expose the legal identity through a public readiness response. |
| Organization | Opaque medical-group or provider-entity reference; relationship status and version. | Require the exact verified relationship; do not infer by shared name or domain. |
| Credentials | Credential type; jurisdiction; verification state; verifier; verified and expiry timestamps; evidence reference. | Store evidence privately; never log or return the credential value. |
| Program assignment | Exact Care program ID and version; authorized role; effective and expiry timestamps. | GLP Care assignment cannot satisfy Quantum EV, and vice versa. |
| Jurisdiction coverage | Exact state code; coverage state; effective and expiry timestamps; evidence version. | Evaluate under the [48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md). |
| Agreement | Opaque agreement reference; execution verification; effective and expiry timestamps. | An unsigned, missing, ambiguous, or superseded agreement is unavailable. |
| Operational status | Review state; suspension or revocation state; last reviewed; next review. | Any uncertainty blocks new exposure-increasing action. |
| Audit | Opaque actor; action category; prior and new state hashes; timestamp. | Append-only, redacted, and inaccessible to public/browser roles. |

## Prohibited fields and locations

No provider record may place these values in a client bundle, public response, URL, log line, analytics event, screenshot, PR, issue, or this documentation:

- clinician or provider legal name;
- license, credential, registration, or national identifier;
- personal email, phone number, address, or schedule;
- agreement text, signature, or confidential commercial term;
- credential document or evidence file contents;
- patient assignment, patient identity, or PHI;
- supplier cost or other confidential supplier economics;
- authentication secret, access token, or provider credential.

## Access model

Future access must be server-authoritative and least privilege:

- public, anonymous, member, Research, commerce, affiliate, supplier, and ordinary support roles receive no roster access;
- Care patients receive only a separately approved minimum-necessary presentation after an actual assignment;
- authorized clinical administrators may review only the fields required for their assigned function;
- credential reviewers may access private evidence only through audited, time-bounded authorization;
- provider users may access only their own verified record and permitted correction workflow;
- service code receives the minimum decision projection, not the full roster record.

No role is granted or changed by this architecture document.

## Exact-provider readiness

Readiness must be computed for one exact provider. A future validator must require the same provider record to hold all required current facts:

1. verified confidential identity;
2. verified organization relationship;
3. active Care role;
4. current credential for the exact jurisdiction;
5. current coverage for the exact program and state;
6. current agreement;
7. no suspension, revocation, conflict, or expiry;
8. authorization for the exact requested action.

Facts from different providers must never be combined. A complete profile for one provider plus a license from another plus coverage from a third is unavailable.

## Fail-closed conditions

Return a stable unavailable decision and no protected provider data when:

- the provider ID is missing, duplicated, malformed, aliased, or caller supplied without an authorized assignment;
- identity or organization evidence is missing or ambiguous;
- a credential is unverified, expired, revoked, superseded, or for another jurisdiction;
- program assignment is absent, expired, paused, or for the other Care program;
- state capability is not active for the exact program;
- an agreement is missing, unverified, expired, or disputed;
- required predecessor evidence changed after an earlier successful decision;
- an idempotent replay is requested by another actor or after authority changed.

## Public and internal projections

Allowed public projection:

- `Care availability cannot be confirmed.`

Potential minimum internal projection:

- opaque provider ID;
- exact program ID and version;
- exact jurisdiction code;
- decision (`available` or `unavailable`);
- stable non-sensitive reason category;
- evidence version hash;
- evaluated and expiry timestamps.

Neither projection contains a name, credential value, contact, agreement content, patient identity, PHI, or supplier cost.

## Related architecture

- [GLP Care and Quantum EV boundaries](GLP_CARE_AND_QUANTUM_EV_BOUNDARIES.md)
- [Care 48-state capability model](CARE_48_STATE_CAPABILITY_MODEL.md)
- [Care workflow state machine](CARE_WORKFLOW_STATE_MACHINE.md)
- [Care privacy test matrix](CARE_PRIVACY_TEST_MATRIX.md)
