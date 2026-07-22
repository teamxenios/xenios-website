# Access Control Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-001 |
| Title | Access Control Policy |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption at program launch; re-review before any new role, privileged tool, or partner access ships |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption and any staff acknowledgment recorded in the decision log) |
| Withdrawal supported | no (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-002, XR-POL-003, XR-POL-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST SP 800-63 Digital Identity Guidelines; OWASP Application Security Verification Standard |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This policy states who may access Xenios Research systems and data, under what identity, and with what limits. It covers the member platform at /research, the admin surface, the database, media storage, the email outbox, Telegram support tooling, and partner touchpoints. It applies to members, former members, staff, the founder, and any future reviewer or partner identity.

## 2. Principles

1. Least privilege: every identity gets the minimum access its job requires, and nothing else. "Least privilege" means access is granted narrowly by role and task, not broadly by trust.
2. Server-side enforcement: the client (browser or app) never decides an authorization outcome and never holds a secret. Every access decision is made and enforced on the server.
3. Deny by default: any access not explicitly granted by the role model below is denied.
4. Row-level authorization: member data is isolated per member at the database and API layer. A member-scoped request can only ever return rows keyed to that authenticated member. Cross-member reads are treated as a security incident, not a bug.
5. Named accountability: every privileged action traces to a named human. During the founding phase that human is Samuel Boadu (samuel@xeniostechnology.com), the server-enforced super administrator.
6. Audit: sensitive actions are server-authorized and written to an append-only audit log.

## 3. Role model

| Role | Who | Access granted | Hard limits |
| --- | --- | --- | --- |
| Visitor / applicant | Anyone at the /research entrance | Entrance and application layer only, behind the shared entrance password | The entrance password unlocks nothing member-facing. No member, order, or admin data. |
| Member | An active, verified, MFA-enrolled member | Their own account, plans, tracker, orders, media, and support surfaces | Own rows only (row-level authorization). No other member's data, ever. No admin routes. |
| Recovery user | A former member after confirmed cancellation | The limited non-member receipt and privacy workflow only: receipts, transaction records, and privacy rights requests | No plans, tracker, media, community, or ordering. Access to full membership ends immediately at cancellation. |
| Reviewer (future) | A named staff reviewer, when staffing exists | Read the application and support queues; propose decisions | Cannot execute privileged changes, rotate secrets, change flags, or see payment credentials. Not active today; creating this role requires counsel review of applicant data visibility. |
| Super administrator | Samuel Boadu, samuel@xeniostechnology.com | Full administrative control: application decisions, plan review, refund and replacement decisions, large-order review, forced resets, suspensions | MFA plus passkey, step-up re-authentication for privileged actions, short privileged sessions, login alerts, a separate admin route, and a documented emergency recovery path (XR-POL-002) |
| Service identities | Server processes (database service role, email sender, storage signer) | Exactly the machine capability they exist for | Keys live only in server environment configuration. Never shipped to a client, never logged, never shared between services where separable. |

Research Reps and affiliates hold no platform access role. They never receive member data, applicant data, passwords, or identity documents. Fulfillment partners (including Mitch during the split-fulfillment period, approximately the first 60 days) receive only the order fields needed to ship: recipient name, shipping address, and order contents for the items they fulfill. They receive no health, tracker, identity verification, or payment data.

## 4. Row-level authorization

1. Every member-scoped table carries a member reference, and every query path filters on the authenticated member's identity, enforced server-side.
2. Database row-level security is enabled with no public policies. The only unrestricted database path is the server's service role, which never leaves the server environment.
3. Media (progress photos, audio, video) lives in private storage. Access is only through short-lived signed URLs issued to the owning member, and every access is written to the access audit log.
4. Aggregate views (for example referral counts) expose aggregates only and must never be combinable to re-identify a person.

## 5. Privileged access controls

1. Admin access requires MFA, uses a separate admin route, and runs on short privileged sessions with step-up re-authentication for consequential actions (details in XR-POL-002).
2. Privileged actions that must be server-authorized and audited include, at minimum: application approval and denial, identity verification overrides (XR-POL-003), refunds and replacements, suspensions and forced resets, retention deletions (XR-POL-005), privacy rights fulfillment (XR-POL-006), and any feature-flag or configuration change.
3. No privileged action is ever performed over Telegram. Telegram is not the system of record and carries no passwords, reset tokens, identity documents, plan PDFs, raw health media, or payment data.

## 6. Granting, revoking, and reviewing access

1. Granting any new role or partner access is a deliberate act: it requires a written entry in the decision log naming who, what access, why, and the review date. Access is never granted verbally or by default.
2. Revocation is immediate on role change, contract end, cancellation, or suspicion of compromise. Confirmed member cancellation ends member access immediately; the recovery-user workflow is the only surviving access.
3. Break-glass revocation: rotating the session signing secret invalidates all outstanding sessions and signed tokens at once. This is reserved for incidents and is always followed by an incident record.
4. Access reviews run on a fixed cadence of [CONFIG: review interval, proposed quarterly] and additionally whenever a role, partner, or privileged tool changes. Each review confirms every active identity, every partner grant, and every service key against this policy, and is recorded in the decision log.

## 7. Relationship to the earlier engineering draft

The worktree already contains docs/security/ACCESS_CONTROL_POLICY.md, an engineering draft describing the currently built state: a single allowlisted admin email, an HMAC-signed gate cookie, emailed status tokens, and no MFA yet. That document describes what exists; this policy describes the required program-level model, including mandatory MFA, the recovery-user role, and the future reviewer role. Where they differ, the canonical business facts govern. Counsel is asked to reconcile the two documents and designate one as controlling.

## Open items for counsel

- Reconcile this policy with the earlier engineering draft at docs/security/ACCESS_CONTROL_POLICY.md (single-admin allowlist, no MFA yet, V3 three-role staff model) and designate the controlling document.
- [COUNSEL: confirm the minimum retention period for access-control and audit records referenced in the metadata table, via XR-POL-005.]
- [CONFIG: confirm the access review interval; quarterly is proposed.]
- [COUNSEL: review applicant and member data visibility before any reviewer role is staffed.]
- [COUNSEL: confirm the minimum contractual access terms for fulfillment partners receiving shipping fields during split fulfillment.]
- [ENTITY]: confirm the exact legal entity that owns the systems and grants access.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
