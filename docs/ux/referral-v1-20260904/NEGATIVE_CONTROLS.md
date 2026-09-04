# Referral V1 negative-control evidence

Reviewed candidate: `c5ac43907ffe024ffcba847fb761836211ae4118` (core SQL/HTTP evidence carried forward from `05e285c`; successors change API response cleanup, local preview composition and browser diagnostics).
Task: `UX-REFERRAL-RECOMMENDATION-V1-20260904`.

This maps the founder's 20 controls in the September 4 directive to the local
candidate. It is not a production attestation, a claim that all website journeys
are complete, or permission to activate a program. The complete 320px functional
browser run passed; full nine-width/visual acceptance remains pending. Consult
the exact-source [checkpoint][checkpoint] and run-specific `browser-results.json`.

**Browser evidence addendum:** the table's earlier "browser pending" qualifiers
are superseded only for the complete local 320px demonstration at c5ac439. That
run proves invalid/revoked/expired context, no automatic capture, exact observed
auth returns, zero binding before fresh sign-in (including claim and recovery),
one expected first-valid binding afterward, owner isolation and admin lifecycle.
There were 495 loopback requests, no outbound/runtime violations, and confirmed
cleanup. It does not prove all nine widths, real OS sharing/email, real request
submission, order-level attribution or Care readiness. PWA occlusion remains an
explicit visual defect. The table's unit/HTTP/PG classifications stay unchanged.

## What the evidence means

- **Unit/UI:** pure validation or rendered components with explicit synthetic
  Auth/API/capability fixtures. These do not prove a live provider or database.
- **HTTP-S:** real Express referral controllers and HTTP requests, but synthetic
  guards and store in [route tests][routes-test]. A sentinel in [wall tests][wall-test]
  proves admission to the next guard, not successful authentication.
- **HTTP-C:** the actual canonical member guard and `/member/me` registration in
  [production-wiring tests][production-test]; only Supabase transport, member rows,
  and unrelated dependencies are synthetic. The guard verifies the supplied
  provider response and exact Auth UUID ownership before the referral hook.
- **PG:** [16 opt-in test cases][db-test] execute the actual candidate SQL and adapters
  in disposable PostgreSQL 18.3. They include real concurrent connections, row
  locks, transaction rollback, permissions and source-schema drift. They do not
  inspect or modify production. Default-suite skips are not database passes.
- **Review:** a source-level capability or write-boundary finding, not an executed
  end-to-end test of a money, fulfillment or clinical workflow.
- **Browser pending:** the [harness][browser-doc] uses the built client, real
  controllers and disposable PostgreSQL, but local synthetic Auth/claim/recovery
  fixtures. Share/clipboard capabilities are explicitly simulated. No actual
  email, OS share delivery or customer transaction is proved.

Latest integration-lead evidence at this candidate: the broader focused run had
**720 passed and 16 opt-in skips across 35 files (736 total)**. Separately, the
complete opt-in **16/16 real PostgreSQL cases passed** in 9.55 seconds with cleanup
confirmed, including expired capture and historical expired-touch binding. The
default-run skips are not passes; the separate actual-database run supplies that
evidence. The expanded HTTP route suite **18 passed**, including explicit `paid`,
`fulfilled`, `payout`, `accountKey` and `verifiedReferrer` refusals;
browser-harness safety **7 passed**. The initial full run had **834 files**,
**12,580 tests: 12,500 passed, 22 failed, 58 skipped**. Five new contract failures
were corrected and their focused suites rerun successfully; 17 inherited
supplier-clock failures remain. This is not a claim that a second complete suite
at the final frozen SHA passed. Typecheck and production build passed as recorded
by the integration lead. No additional tests were run to write this document.

## The 20 required controls

| # | Required control | Actual evidence and boundary |
| --- | --- | --- |
| 1 | Invalid referral link cannot become verified attribution. | **HTTP-S, PG, Unit/UI.** [Routes][routes-test] refuse an unregistered token and do not call capture; a persistence failure mints no attribution cookie. [PG][db-test] rejects an unregistered digest and a nonexistent capture. [Recipient][recipient-test] rejects malformed code shapes and failed resolution without capture/navigation. An opaque signature alone is not registration or attribution authority. Browser invalid-link proof remains pending. |
| 2 | Revoked link cannot create a new verified attribution. | **HTTP-S, PG.** Routes refuse capture after revocation. The PG concurrent-capture test revokes the winning link, rejects its use by a new visitor, and preserves the old winner as historical with `availability: revoked`. Existing historical evidence is not silently deleted or represented as currently eligible. |
| 3 | Expired link cannot create a new verified attribution. | **PG, adapter tests.** The expiry case, now also passed within the complete 16-case PG rerun, inserts an expired link and a historical touch captured while valid, with constraints and immutable guards enabled. It rejects resolution, fresh and historical-subject capture, and two attempted bindings of the expired touch; a later valid incoming link retains that historical winner as expired. No new touch, binding or audit count appears. These are explicit historical database fixtures, not a time-elapsed browser journey. [Store tests][store-test] also reject expired incoming resolution. The browser expired-invitation result remains pending. |
| 4 | User cannot change URL parameters to become another partner. | **HTTP-S, HTTP-C, PG.** Strict issue bodies reject supplied `partnerId`; the owner comes from canonical Auth-to-member-to-partner lookup, not query/body identity. HTTP-C ignores an adversarial `actorAuthUserId` query and verifies the expected actor sent to SQL. PG rejects cross-partner revoke and idempotency replay. [Shared destination tests][destination-test] reject referral/query-bearing destination inputs. |
| 5 | Customer cannot choose their own verified referrer. | **HTTP-S, HTTP-C, PG, token tests.** The expanded passing route cases explicitly reject `accountKey` and `verifiedReferrer` before issuance. [Signed visitor/capture locators][tokens-test] are visitor-bound, purpose-separated and reject tampering, duplicates and mismatches. A caller cannot submit a partner, touch or account as verified browser truth. SQL takes the winning stored touch, rejects missing provenance and self-referral, and refuses a capture already bound to another account. A customer may explicitly open/continue a valid recommendation; that is not authority to forge or overwrite a verified referrer. |
| 6 | Partner A cannot see Partner B's referrals. | **PG, HTTP-S, Unit/UI.** SQL `listOwn` filters by the partner derived from the canonical actor; PG verifies the owner's exact link list and wrong-owner mutation denial. Owner HTTP uses that actor only; admin lifecycle requires a separate admin guard. [Owner UI tests][owner-test] discard late responses after account changes. Ordinary-member admin denial is tested separately; full browser proof is pending. |
| 7 | Partner cannot see unrelated customer data. | **HTTP-S, Unit/UI, Review.** Owner link DTOs contain bounded link fields and aggregate capture/account-binding counts, not contacts or customer rows. Routes test forbidden private fields; owner UI tests use the canonical read and clear stale principal responses. Customer-account keys appear only in the separately guarded internal admin projection, never an owner/public URL. Counts are not unique-person or conversion totals. |
| 8 | Referral owner cannot change their commission percentage. | **HTTP-S, Review.** A browser-supplied `commission` field is rejected before `store.issue`. All V1 HTTP mutation bodies are strict; the [SQL operation allowlist][sql] has no commission-setting operation and no commission-table writer. This proves the V1 boundary, not a new commission engine or an audit of every pre-existing commercial endpoint. |
| 9 | Referral link cannot mark a request paid. | **HTTP-S, Review.** The expanded passing route suite rejects `paid: true` before issuance. V1 writes only links, touches, account bindings, idempotency results and referral audit events. The separate [lineage RPC][lineage-sql] is read-only: it may display a canonical request's existing state but cannot update it. There is no V1 payment command or payment-proof input. This is a tested boundary refusal, not an executed request-payment transition test. |
| 10 | Referral link cannot mark an order fulfilled. | **HTTP-S, Review, PG read-only lineage/permissions.** The expanded passing route suite rejects `fulfilled: true` before issuance. Neither V1 SQL candidate writes order fulfillment; lineage projects a canonical state only. PG exercises lineage through the service-only RPC with no direct service table reads. There is no fulfillment action in the referral controller. This does not attest an executed fulfillment transition workflow. |
| 11 | Referral click cannot create a payout. | **HTTP-S, Unit/UI, token tests, Review.** The expanded passing route suite rejects a supplied `payout` before issuance. Recipient resolution and StrictMode remount produce no capture or bind; explicit Continue is required. Even a successful capture writes attribution evidence only. V1's capture-cookie format is explicitly rejected by the legacy money-bearing verifier in token tests, and the V1 operation/write inventory contains no payout or ledger writer. A click, capture or account binding is not a conversion, commission or payout; no actual payout workflow is exercised. |
| 12 | Care clinical fields never enter referral projections. | **HTTP-S, Unit/UI, PG.** Issue rejects `symptoms`; all accepted HTTP bodies are strict. [Admin UI tests][admin-test] omit injected clinical notes and contact fields. PG lineage verifies no clinical/contact/address/session-hash fields leave the read-only projection, and [lineage adapter tests][lineage-test] fail closed on malformed data. Care is a bounded discovery destination; no patient identity, intake, clinician relationship or clinical conversion is inferred. These are synthetic-field controls, not a production PHI audit. |
| 13 | Raw email/phone/name is not placed in the public referral URL. | **Token tests, HTTP-S, Unit/UI.** Public links are exactly same-origin `/r/r1_<opaque token>`; the token does not contain the private link UUID. HTTP owner output excludes private identifiers/contact fields. [Share tests][share-test] reject query/hash/userinfo and off-origin URLs rather than copying them. Recipient tests keep the raw referral token out of rendered context and document head. Public URLs contain no identity fields; authorized internal admin keys are not public identifiers. |
| 14 | Open redirect payloads are rejected. | **Unit/UI, HTTP-S.** [Destination tests][destination-test], [share tests][share-test] and route tests reject external/protocol-relative/backslash paths, traversal, privileged routes, unsafe query/hash and malformed product paths. The recipient refuses unsafe returned destinations. Server destinations are a strict subset of the existing closed auth policy, not a second looser redirect system. |
| 15 | Unsafe `returnTo` is rejected. | **Shared/unit and canonical auth regressions.** [Auth-return tests][return-test] reject external, malformed, privileged and unmounted destinations and strip credential/contact/unbounded query hints. [Member tests][members-test] build recovery redirects from the configured site plus the shared helper, preserve generic anti-enumeration responses, and reject unsafe context. [Sign-in][signin-test] and [reset continuity][reset-test] reject unsafe navigation and strip credentials. |
| 16 | Authentication preserves valid safe context. | **HTTP-C, Unit/UI; browser pending.** The actual member probe verifies Auth ownership before binding; invalid, foreign and recovery-purpose sessions do not bind. A pending member remains pending; optional attribution failure does not break legitimate auth. Existing sign-in/reset tests preserve the safe destination, and [layout tests][layout-test] put exact private catalog/product destinations behind their existing member guard rather than the review-password wall. The browser harness now asserts the actual observed redirect and clicked links, no binding during recovery/after claim, and exactly the expected link after fresh normal sign-in. These assertions are not a completed browser result or proof of real provider email delivery. |
| 17 | Duplicate capture remains idempotent. | **PG.** Eight concurrent captures for one subject and competing valid links produce exactly one winning touch and one audit event. Eight concurrent issue retries produce one issued link and one audit entry despite new token candidates; changed intent conflicts. Account-binding retries likewise produce one winner/event. These are real PostgreSQL transactions/connections, not an in-memory simulation. |
| 18 | Existing first-valid attribution is not silently overwritten. | **PG, HTTP-S, Review.** Competing captures retain one first winner; a later ready link does not replace a revoked historical winner or cause a new signed recognized cookie. Competing devices bind an Auth account once; one capture cannot bind two accounts. SQL refuses to overwrite a legacy binding and returns current eligibility separately from immutable history. Deleting cookies or using another browser creates another anonymous visitor; no pre-auth cross-device identity recognition is claimed. |
| 19 | Admin correction is audit logged if correction exists. | **Not implemented / conditional requirement not applicable.** Shared/admin DTOs explicitly return `correctionsSupported: false`; the UI has refresh only and says corrections are unsupported. There is no correction writer. This is not a passed correction-audit test. Existing supported issue/revoke/capture/bind events are append-only; PG proves mutation/audit/idempotency rollback together and refuses direct evidence edits/deletes. |
| 20 | Generic consumer recommendation does not automatically become a compensated medical referral. | **Unit/UI, HTTP-C, PG, Review.** Ordinary users are not automatically enrolled or granted link issuance: SQL requires the already-authorized Gen2 partner and current eligibility, and owner UI reports ineligibility honestly. Referral binding does not activate membership. Recipient copy preserves Care/Research separation and no account/clinical relationship is created by a click. No commission, clinical-conversion or payout writer is added. Ordinary-consumer compensated referral is not an implemented feature and is not presented as a completed medical-referral program or legal determination. |

## Additional fail-closed controls

The production dependency tests require every independent feature capability,
strong signing configuration, exact SQL authority and literal successful durable
rate-limit response. There is no in-memory production fallback. Same-origin JSON,
UUID idempotency keys and visitor-bound CSRF are enforced by HTTP controllers.
Missing/malformed/duplicate capture cookies do not consume the optional member
probe's referral budget or trigger database work. Provider errors are sanitized.

Real PG tests deny browser execution of service-only RPCs; deny direct reads and
mutation of protected evidence; detect owner/search-path/grant/trigger drift;
wait for an external partner-suspension row lock; and reject self-referral,
closed/unknown members and stale ownership. Database service-role authority is
not independent end-user authentication: the canonical server guard remains
mandatory.

[Document-header tests][wall-test] exercise the real Research page gate for
normalized `/r` variants. [Tracking tests][tracking-test] prevent marketing
initialization on recommendation documents and preserve full-document privacy
boundaries. The preview additionally forces safe local headers and blocks
outbound access; those preview safety measures alone must not be cited as proof
of production header configuration.

## Honest request/order lineage and remaining evidence limits

The only downstream claim is **post-binding, exact-member-owned canonical
request/order lineage**, always labeled `account_binding_only`. Owner joins do
not prove independently verified order-level referral attribution. Pre-binding,
other-member and EA-session-only/claim-later records are excluded. Missing,
drifted, duplicate, malformed or overflowing sources return `unavailable`, not
fabricated empty success. Tests cover timestamp boundaries, including
microseconds, and per-account/source caps.

Browser downstream records are inserted by a separate explicit local IPC fixture
action only after real binding. Their display does not prove a customer submitted
a request, paid, received fulfillment, earned compensation or entered clinical
care. The wider Early Access/request/order conversion integration remains outside
this evidence. A visible pre-existing PWA install overlay at narrow width is a
separate recorded UX defect, not a clean visual acceptance claim.

The existing [Care home page][care-home] has static introductory copy saying Care
is accepting access requests and a heading saying the request line is verified
live, independently of the form's actual enabled/disabled status. This inherited
copy/status mismatch is a **next Care-journey action**, outside the referral,
deterministic-fixture and PWA tasks; it has not been changed here. The local
preview's Care dependencies are being corrected to return an explicitly disabled
status rather than missing read-only endpoints. Browser arrival at `/care` proves
pathway navigation only, not Care intake readiness or a working clinical service.

The integration lead's automated diff scan reported 10 generic assigned-secret
matches, manually reviewed as synthetic UI tokens, a local preview password and
test signing keys. No live credential was found in that review, but the scanner
returned findings: **do not label it a clean automated scan**. The separate
named-person/production PII scan was not run because no names corpus was supplied.
Synthetic DTO/URL negative controls do not replace that missing attestation.

No production database, deployment, configuration, activation, real message,
payment, fulfillment, commission or clinical action was performed by this work.
The two SQL files remain local candidates outside the production migration DAG.

[checkpoint]: ../../research-launch/FULL_UX_FOUNDATION_REFERRAL_V1_2026-09-04.md
[browser-doc]: browser-harness.md
[routes-test]: ../../../server/research/partners/referral-v1-routes.test.ts
[wall-test]: ../../../server/research/partners/referral-v1-wall.test.ts
[production-test]: ../../../server/research/partners/referral-v1-production.test.ts
[db-test]: ../../../server/research/partners/referral-v1-database.test.ts
[store-test]: ../../../server/research/partners/referral-v1-store.test.ts
[tokens-test]: ../../../server/research/partners/referral-v1-tokens.test.ts
[lineage-test]: ../../../server/research/partners/referral-v1-lineage.test.ts
[sql]: ../../../supabase/candidates/20260904_research_partner_referral_v1.sql
[lineage-sql]: ../../../supabase/candidates/20260904_research_partner_referral_v1_lineage.sql
[destination-test]: ../../../shared/research/referral-v1.test.ts
[return-test]: ../../../shared/research/auth-return-to.test.ts
[members-test]: ../../../server/research/members.test.ts
[recipient-test]: ../../../client/src/research/recommendation/Recipient.test.tsx
[share-test]: ../../../client/src/research/recommendation/share.test.ts
[owner-test]: ../../../client/src/research/pages/partners/Links.test.tsx
[admin-test]: ../../../client/src/research/pages/adminx/ReferralLifecycle.test.tsx
[signin-test]: ../../../client/src/research/pages/sign-in.test.tsx
[reset-test]: ../../../client/src/research/pages/reset-password-continuity.test.tsx
[layout-test]: ../../../client/src/research/recommendation/layout-referral.test.tsx
[tracking-test]: ../../../client/src/lib/tracking.test.ts
[care-home]: ../../../client/src/care/CarePublicPages.tsx
