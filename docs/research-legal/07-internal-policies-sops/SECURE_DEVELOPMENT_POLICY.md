# Secure Development Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-011 |
| Title | Secure Development Policy |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applies to every code, schema, configuration, and infrastructure change to Xenios Research systems |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | change records, reviews, and scan results per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-007, XR-POL-010, XR-POL-012 |
| Sources | See 00-register/SOURCE_REGISTRY.md; OWASP secure development guidance; NIST secure software development guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This policy sets the engineering rules for building and changing Xenios Research: the member platform behind /research, the admin surface, the tracker and media systems, commerce and subscription code, integrations, and infrastructure configuration. The program's promises to members (agreements before payment, mandatory MFA, private media, immediate cancellation effects, no health data to advertisers) are only as real as the code that enforces them, so development discipline is a compliance control, not just craft.

## 2. Branch and pull request discipline

1. No direct changes to the production branch. Every change lands through a branch and a pull request with review before merge.
2. Small, single-purpose changes. A change that mixes an authorization edit with a styling edit is split.
3. Plan before build for high-risk changes: authentication, authorization, session handling, payments, identity verification, consent capture, cancellation, schema changes, secrets handling, and any change touching more than a handful of files gets a written plan first.
4. Reviews check security behavior, not just correctness: does the change respect the authorization model, the consent gates, the flag defaults, and the logging rules (XR-POL-012)?
5. During the founding phase one person may author and merge. That concentration is a known risk; the compensating controls are the test gates in section 7, the plan-first rule, and honest self-review. [COUNSEL: advise whether any regime Xenios targets requires independent review evidence.]

## 3. Migration and schema review

1. Every database migration is reviewed before it runs against production, with special attention to: row-level security and authorization policies, columns that widen data collection (a new column is a new privacy decision), defaults, and cascade behavior on delete.
2. Migrations that touch consent, agreement acceptance, audit, or retention tables are high-risk by definition and follow the plan-first rule.
3. Every migration has a rollback path, and a backup or snapshot point precedes destructive migrations.
4. A migration may not silently change data classification. Moving data into a more sensitive class re-triggers the vendor screen (XR-POL-010) and the logging review (XR-POL-012).

## 4. Dependency and vulnerability management

1. Dependencies are pinned through lockfiles and updated deliberately, not implicitly.
2. Automated dependency and vulnerability scanning runs on the repository; findings are triaged with severity and either fixed, mitigated, or accepted in writing with a revisit date. [CONFIG: scanning tooling and cadence.]
3. New dependencies are chosen conservatively: maintained, widely used, license-compatible. A dependency that requires sending member data off-platform is a vendor decision under XR-POL-010, not a library decision.
4. Vulnerabilities in the deployed stack that plausibly affect member data are handled as incidents under XR-POL-007, not as routine backlog.

## 5. Secret hygiene

1. No secrets in code, configuration files committed to the repository, prompts to AI tools, logs, documentation, tickets, test fixtures, or screenshots. This list is deliberately explicit about prompts: AI-assisted development is in use, and a pasted API key in a prompt is an exposure like any other.
2. Secrets live in environment configuration or a secret manager and reach code by injection. Code references secrets by name, never by value.
3. Startup diagnostics may log whether a secret is configured (a boolean), never the value.
4. A secret found anywhere it should not be triggers immediate rotation and an incident record under XR-POL-007. Git history counts: a secret committed and then deleted is still exposed and is still rotated.
5. Distinct secrets per environment. Production secrets never appear in development or test environments.

## 6. Feature flags default false

1. Every consequential capability ships behind a flag that defaults to off: health-data collection lanes, wearable integrations, exports, commerce capabilities, Quantum commerce (which stays disabled until its lane is approved), peptide and Quantum affiliate commissions (disabled until their lanes are approved), and any new data flow to a vendor.
2. Turning a flag on is a governed event, not a code change side effect: it requires the listed preconditions (counsel sign-off where the flag gates a legal lane, consent capture in force, vendor screens done) and is recorded with who, when, and why.
3. Flags fail closed. If flag state is unavailable, the capability behaves as off.
4. Flag inventory is reviewed periodically to confirm production state matches the approved state; an unexpected flag flip is investigated under XR-POL-007.

## 7. Test gates

The suite must include, and keep green, tests that prove the program's promises. A change that breaks one of these does not ship:

1. Authorization and isolation: a member can never read or write another member's records (tracker entries, media, orders, plans, messages). Server-side authorization and row-level policies are tested directly, including negative cases.
2. Admin boundary: admin capabilities are reachable only by the server-enforced super administrator identity; privilege checks run per request.
3. Order of activation: agreements are presented and accepted before payment; the flow cannot be sequenced around. Acceptance events record timestamp, document version, and member reference.
4. Age and access gates: 21+ gating and the private-entrance boundary hold; the entrance password unlocks nothing member-facing.
5. Cancellation semantics: confirmed cancellation ends access immediately and the pre-confirmation disclosures render.
6. Consent gates: gated data collection (health entries, sexual-wellness data, wearables, media) is impossible without the corresponding recorded consent, and revocation closes the gate.
7. Redaction and logging: sensitive fields never appear in logs (XR-POL-012), request bodies on sensitive routes are excluded, and audit events are emitted for the actions that require them.
8. Approval and duplicate-execution safety for consequential server actions (payments, refunds, deletions): idempotency keys or equivalent protections are tested.

## 8. Release and rollback

1. Deploys are repeatable and attributable: what was deployed, by whom, and when.
2. Every release has a rollback point (previous build plus compatible schema state).
3. After a security-relevant release, verify the affected control in production (for example: the flag is off, the redaction holds, the gate rejects).
4. Emergency fixes follow the same review rules compressed in time, never skipped; the incident record (XR-POL-007) carries the justification.

## 9. Third-party and AI-generated code intake

1. External code (libraries, snippets, generated code) is reviewed to the same standard as first-party code before it touches member data paths.
2. License and provenance are checked before adoption; obligations are recorded.
3. Generated code that touches authorization, payments, consent, or logging gets line-by-line review against this policy; convenience never outranks the test gates in section 7.

## Open items for counsel

- Advise whether any targeted regime requires independent code review evidence beyond single-founder self-review during the founding phase (section 2).
- Confirm the minimum retention period for change records, reviews, and scan results (metadata table).
- Confirm whether flag-activation records for legally gated lanes (health data, Quantum, commissions) need any specific evidentiary form (section 6).
- Confirm alignment of this policy's activation-order and cancellation test gates with the final counsel-approved member flows (section 7).

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
