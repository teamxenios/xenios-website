# Xenios client-account RC — P1 remediation recut (2026-08-27)

The independent Codex adversarial review FAILED the frozen RC
`b432d7a44cf18807762598b1bdf3bef77eebdbd9`
(`integration/xenios-client-account-final-rc-20260826`). That SHA is NOT to be
deployed. This branch (`fix/xenios-client-account-p1-remediation-20260827`)
was cut from the exact failed SHA and closes every deployment-blocking P1 with
the smallest safe change, preferring a TRUTHFUL DISABLED STATE over partial or
guessed production behavior. The old RC branch is untouched.

## P1 dispositions

| # | Finding | Disposition |
|---|---|---|
| P1-1 | Email-fallback authorization | **FIXED.** Member resolution is exact `auth_user_id` binding only, at BOTH sites (`member-auth.ts` resolver, `catalog-display-viewer.ts`). Legacy rebinding is an explicit administrative act, never request-time inference. 7-scenario regression matrix (stale email, deleted/recreated auth account, recycled email, changed email, shared historical email, exact-id success, email-only rejection); the test that pinned the fallback is inverted. |
| P1-2 | Inactive-member catalog leak | **FIXED.** `GET /api/research/customer-account/catalog-priority` sits behind injected `requireActiveMember`; the seven per-member paths deliberately keep `requireMember`. Status matrix tested (active allowed; pending/paused/cancelled/past_due/unauthenticated refused; the port is never reached on a refusal). Wall note + protection-manifest seam hashes updated with dated notes. |
| P1-3 | Payment-state guessing | **FIXED.** Display vocabulary is `unpaid / paid / partially_refunded / refunded / unknown`. `paid` only through recorded capture; `refunded` as itself (its transition requires provider confirmation); `exception`/`cancelled`/`replaced` — reachable both sides of capture — answer `unknown`. Full 14-state truth table pinned; the tests that encoded refunded→paid and cancelled→awaiting are inverted. |
| P1-4 | Order history / fulfillment truth | **FIXED (option B).** `CustomerOrdersDto` carries an explicit completeness declaration; the composition root computes unavailable sources from its own wiring facts (XRR has no list-by-member read anywhere; XEA/XEC/commerce availability by flag/wiring); the client renders "Some historical order information is not yet available" and never claims an empty account over an incomplete read. `shipped`/`delivered` require durable shipment evidence; otherwise `unknown`; tracking stays null without a real carrier fact. |
| P1-5 | Billing truth erasure | **FIXED.** Access state (from `status`) and billing state (from `billing_state`) are independent DTO fields; the enforcement flag no longer touches display truth. Every stored billing state renders identically with enforcement on and off; absence renders `unknown`, never `current`; renewal dates and portal URLs are never invented. Client shows the two truths as separate badges. |
| P1-6 | Care DTO contract | **FIXED.** One canonical `CareEnrollmentDto` end to end: the loader types the real wire shape, the view reads `data.enrolled` + `data.status.*` with three truthful states (not started / status unavailable / staged timeline), and a route-to-view contract test drives the ACTUAL server envelope into the ACTUAL view. Care is NOT expanded: the production port stays the truthful not-enrolled literal while no durable Care source exists. |
| P1-7 | Activation monotonicity | **FIXED.** `resolveActivationStatus` clamps every branch to the more restrictive of (base, proposed): held stays held, unavailable stays unavailable, for every overlay shape. Malformed overlay config FAILS CLOSED (a typo'd basis, non-boolean hold, unreadable checklist, or malformed approval refuses the entire load — nothing degrades to "none", no entry is dropped, no hold is lost). Full Cartesian suite (7 bases × 11 overlay shapes) + malformed-config attacks + CTA pins (held/unavailable never gain any ordering action). |
| P1-8 | Migration effective privileges | **FIXED BUT UNAPPLIED.** `REVOKE ALL` from `PUBLIC`/`anon`/`authenticated`/`service_role` on every table and the audit sequence before the exact grants; function EXECUTE revoked from `PUBLIC`; audit append-only BY TRIGGER (owner-proof). The candidate is marked NOT READY FOR APPLY and nothing in this release depends on it. |
| P1-9 | Invitation governance | **FIXED BUT UNAPPLIED.** `staging_id` NOT NULL; one live invitation per person (partial unique index); trigger-enforced state machine for EVERY writer; approval requires contact + granted consent + a CURRENTLY-ACTIVE `super_admin` verified against `research_prelaunch_role_assignments` — actor text is never authority; `service_role` is SELECT-only with two governed SECURITY DEFINER doors. 18-attack disposable-PG rehearsal, all refused (evidence: `docs/research/CLIENT_ACCOUNT_MIGRATION_ATTACK_REHEARSAL_2026-08-27.md`), including the exact previously-passing `approved_by='Samuel'` write. |
| P1-10 | Import privacy | **PRODUCTION-DISABLED + FIXED.** The admin import surface is behind `RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED === "true"` (route-absence idiom; flag absent ⇒ no route exists), source-pinned by test. The report boundary carries canonical codes, counts, and non-reversible 12-hex product refs ONLY — no raw name or product string crosses HTTP or the admin UI. The local dry-run CLI remains for authorized operators. |
| P1-11 | Import integrity | **PRODUCTION-DISABLED + FIXED.** NFKC normalization + control/bidi stripping; strict length bounds (name 200 / product 500); blank/oversized/malformed rows REJECTED and counted (`rejectedRows` + per-code counts; `totalRows = rejected + processed`); per-person interest dedupe (no demand inflation); formula-shaped cells classified and never mapped/echoed; punctuation/suffix ambiguity classified, never silently merged. Attack tests: whitespace-only, 10k name, 10k product, Unicode-equivalent names, punctuation variants, suffix ambiguity, repeated interest, formula value, malformed row, duplicate row, repeated batch, missing contact/consent. |

## Release scope declaration

**ENABLED + AUTHORITATIVE**
- Sign-in / member session (exact auth-id binding), returnTo journey, account chrome.
- Account overview identity; membership ACCESS state; membership BILLING state (from the stored ledger, flag-independent).
- Research order rows that the wired commerce/XEA read actually returns, with lifecycle-provable payment states (`unpaid`/`paid`/`refunded`).
- Catalog-priority projection (ACTIVE members only), activation statuses + 13-item queue, monotonically restrictive.
- Support case reading + creation over `research_member_questions`; documents listing over `research_plan_documents` with ownership-scoped bytes.

**ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE**
- Payment state for post-capture-ambiguous lifecycles (`exception`/`cancelled`/`replaced`) → `unknown`.
- Fulfillment without durable shipment evidence → `unknown`; tracking null without a carrier fact.
- Order-history completeness → declared incomplete with named unavailable sources (XRR always; XEA/XEC/commerce per wiring).
- Billing state where no stored value is readable → `unknown`; renewal date → "not scheduled in a connected source".
- Care → "Care not started" / "Care status unavailable" (no durable Care source; nothing fabricated, nothing inferred from membership/orders/interests/attribution).

**PRODUCTION DISABLED**
- Client-import admin surface (`RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED` absent ⇒ no route). Local CLI only.
- Real account invitations, partner seed, persistent Seth-client import, activation audit persistence — all migration-dependent, all off.

**FUTURE MIGRATION REQUIRED**
- `supabase/candidates/20260826_research_client_accounts_blitz.sql` (reworked, attack-rehearsed, NOT READY FOR APPLY — needs its own review + ledger/DAG registration).
- XRR list-by-member read; XEC cart-history RPC; durable Care case source; Stripe billing portal/renewal schedule.

## Reproducible scans

`scripts/acceptance/scan-release-diff.mjs <base> <head> [--names-file <out-of-repo list>] [--allow-name <principal>]`
replaces the previous ad-hoc session scans. This recut ran it over
`6a2df29..HEAD` (the whole integration delta): secret findings 0; PII findings
0 with one PRINTED allowance (the partner-principal the founder's directive
names as relationship owner, who also appears in the demand file).

Verification numbers, browser QA evidence, and the recut SHA are recorded in
the final handoff for this branch.
