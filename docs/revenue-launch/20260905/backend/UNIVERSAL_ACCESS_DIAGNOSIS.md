# Universal account diagnosis checkpoint

Founder decision: remove memberships as the customer/partner access model.
Approved account access must not require an activation or monthly membership fee.
Canonical Auth, account records and historical payment/audit evidence remain the
sources of truth. No live account grant, invitation or billing mutation occurred.

POST `/api/admin/research/access/inspect` is an admin-guarded, read-only exact-email
diagnosis mounted by the existing membership/account composition. The email is
in the JSON body, not a URL. Private headers precede authentication. An unavailable
Auth/core-table read refuses the whole inspection instead of claiming no account.
Auth pages are bounded and completion is required before absence is asserted.

The explicit shared DTO reports Auth verification and sign-in history presence,
applications, exact Auth/member binding, member/partner binding, partner
requirements, and owner-scoped organization relationship records. It does not
expose provider metadata, secrets, agreement contents, tax documents or clinical
information. A same-email partner without the exact member binding is not linked.
Care remains a separate authority. Referral V1 makes its own eligibility decision.

The projection reuses the canonical four agreement / fourteen training requirements
and flags absent, declined, stale-version, malformed or future-dated evidence.
It does not certify or activate the partner. Existing action consequences explain
the legacy application's onboarding email and the currently unavailable partner
lifecycle command. The universal no-membership approval/claim writer is the next
implementation slice and will replace the old paid-activation action.

Tests: 43 passed across route/projection, production adapter and existing membership
tests; full TypeScript check passed for the implementation. Synthetic tests cover
two-email/ID conflicts, missing bindings, unverified identities, unauthorized
readers, forged commands, provider failure, pagination truncation, scoped query
fields and private-field exclusion. No real account acceptance yet.

First acceptance diagnosis at 18:13:40Z: no Auth/application/member/partner for
either supplied exact email; one separate Care operational request. Founder
subsequently selected the business contact email; no owner verification inferred.
Raw identity and Care details are intentionally excluded from the repository.
