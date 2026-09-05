# Approved customer access and membership retirement — ASTRA-B client slice

This is a tested integration slice, not the final revenue-launch candidate and not a production-completion claim. ASTRA-A owns the durable RPCs, server authorization, integration, migration decisions and eventual approved production execution. No live account was approved, no real email was sent, and no production configuration, price or database change was performed here.

## Controlling policy and dependencies

Seth is the first acceptance user, not a special-case architecture. Every flow is generic. The founder's removal of paid memberships removes the payment prerequisite for approved customer access; it does not erase account history, cancel historical charges, auto-approve an unknown account, or grant partner/referral/organization/Care eligibility.

Four shared contracts were adopted exactly from A commit `a0b3e328341c927e29994c9f2e6d048fc5e7a87a`: approved-customer-access, approved-user-access, membership-types and auth-return-to. B adoption commit `c1117b27a3c380a1a255eb9f359aa7387691d980` must be skipped when A integrates the client feature. Staged Git comparison against the A blobs was empty before that adoption commit.

Later coordinator policy permits explicit reviewed reapproval of a verified, singly bound `pending_activation` or `past_due` customer. An already-active application is eligible only with one of those restricted member statuses. Active customer accounts should sign in normally; paused, cancelled, closed, conflicting and unknown identities remain blocked. Normal sign-in does not itself reopen a restricted account.

## Implemented

- Exact-email diagnosis remains a read. A separate approval form appears only when the server reports the provisioned customer-approval authority and a coherent eligible snapshot. Existing applications require their exact ID and updatedAt; confirmed absence sends both fields null.
- Approval requires names, an internal reason and a separate confirmation of the exact recipient, record revision and email consequence. The strict adapter sends one explicit bearer-scoped, idempotent request. It refuses malformed or mismatched successful results.
- A successful response says approval recorded and onboarding email queued, not delivered, claimed or signed in. The configured worker may send immediately. Partner, referral, organization and Care permissions are not granted.
- An unconfirmed outcome preserves the exact frozen payload and idempotency key. Diagnosis edits, refresh and record links are locked until a known result/refusal; retries use the same request. A principal change hides prior state. No approval payload, bearer or inspected email is written to client storage or navigation.
- The approved-customer claim page uses canonical provider session lookup even for an Auth identity without a customer record. New sign-ins use a password plus the purpose-bound link; existing sign-ins use ordinary bearer plus link and never reset a password. Only approved_customer offers claim; active application status offers ordinary sign-in. Success requires the strict server claim DTO.
- Link credentials are scrubbed from navigation and retained only in the pre-existing ephemeral tab slot, or in memory if storage writes fail. Memory-only mode explicitly tells users to reopen their email link after signing in. Recovery sessions and stale link/provider contexts cannot claim.
- Sign-in preserves an ordinary Auth-only session. Only the exact safe status return path plus the ephemeral link can resume a missing-account claim. Closed/unknown/recovery denials cannot. Active defaults to `/research/account`; safe requested destinations remain honored.
- Core clears prior principal member/catalog/cart views while checking a new token. It restores an opaque scoped cart only after canonical active-account verification. Token refresh, sign-out, unmount and recovery guards remain.
- The historical activation page no longer hosts the paid activation stepper. It displays canonical account access or review/sign-in remedies without calling activation billing APIs. Historical billing pages retain source records and distinguish missing/unavailable data from a measured empty history; no refund or cancellation is inferred.
- Admin ApplicationDetail no longer calls legacy paid approve/begin-activation/activate actions. It retains review, information-request, decline and source timeline behavior, with token/record isolation and malformed/stale response handling. New customer approval is reached through diagnosis, not by relabeling an old endpoint.
- Account/admin navigation and related customer-page copy no longer advertise the old membership fees. Actual product subscriptions and recorded referral economics remain unchanged. Sign-in support uses team@xeniostechnology.com. Other sender/provider configuration remains A-owned.

## Verification

Node 20.19.0. Final focused regression: **701/701 tests across 27 files, exit 0**, covering changed test files plus actual recovery isolation, account gating, partner dashboard/links and historical billing denials. Repository `tsc --noEmit`: exit 0. Final client/server build: exit 0. Existing admin static/dynamic import and large-chunk warnings remain. Scoped whitespace check passed.

A broader Research client sweep before the final policy/test alignment ran 234 files: **2,779 passed and 8 failed**. The eight failures were old account-home/paid-copy/reviewer-gate expectations and two status-page tests missing its new context mock. All seven affected files are included in the final passing focused run. The full 234-file sweep was not repeated; A retains the integrated final-gate responsibility. Existing unrelated React act/scrollTo test warnings were observed, not treated as production failures.

Independent review caught an uncertain-request key-loss defect caused by refreshing diagnosis; the parent operation lock and its regression fixed it. Separate review covered identity/snapshot eligibility, retry semantics, no role grants, source truth and credential isolation. Final independent focused reviews reported no remaining concrete blocker in these client changes.

### Local browser evidence

The isolated port-4176 fixture uses the real panel/adapters with strict synthetic DTOs. Every fetch except the two exact same-origin synthetic POSTs is denied; no provider or external network fallback exists. All results represent invented local data.

- Approved-absent customer: exact recipient, names, reason and null snapshot were reviewed before explicit confirmation; result reported queued, not delivered or claimed.
- Reviewed past-due customer with active application: explicit review remained required; historical billing was not treated as a new payment prerequisite.
- Uncertain approval: synthetic 503 left the original request intact, email/refresh disabled and diagnosis locked; same-key retry returned the earlier queued result.
- Stale inspection: explicit server refusal instructed refresh/review and did not display success.
- Approval confirmation document containment passed at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320 pixels. The mobile confirmation was visually inspected.

The port-5221 preview used the actual built SPA and existing real page/API walls with synthetic GoTrue-shaped authentication and account tables, in a sanitized loopback-fenced process. Ordinary Customer A signed in to `/research/account`, had no partner workspace, and restored the same private account after refresh. The historical `/research/activate` route showed active customer access and an account link, with no payment step. Unknown commerce history remained unavailable, not zero. This preview does not implement the new durable approval/claim RPC, so it is not integrated production-claim evidence.

## Remaining integration and production gates

A must integrate the exact client feature, execute the complete approved-customer server/RPC and email/claim rehearsal, verify actual production schema/configuration and identities, and retain the exact-SHA founder gate. Live email delivery, recipient ownership, actual customer/partner binding, canonical partner requirement evidence and certification/activation, referral availability, product readiness and controlled purchase/payment/fulfillment evidence remain separate requirements.

Public `/research/apply` remains documentation-pending, not open public signup. The compatibility membership-history endpoint may remain unavailable; the actual account billing-history view is the supported link, and missing source data is not fabricated. Historical recurring charges are not asserted canceled by this UI retirement. No production authority is conferred by this checkpoint.
