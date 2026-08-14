# Release A — QA acceptance contracts

Authored by bottom-right (QA/Security/Release Defense) under the founder override,
so top-right and top-left build the Release-A surfaces against attack criteria from
the first commit rather than discovering them at handoff. Each contract is a set of
properties I will attack; a handoff is ACCEPTED only when every MUST holds with a
test, and every negative control catches its planted defect. These are testable
invariants, not design opinions; where a decision is genuinely the builder's, it is
marked CHOICE and only its safety is constrained.

Base at authoring: train tip 347f684 (ROMAN_RELEASE_0_3, live). Existing seams to
extend, NOT duplicate: `server/research/account-identity/` (context, claims,
org invitations, password-change), `server/research/product-requests.ts`
(request/status/admin), the durable outbox, the founder-release ledger + buyer-scoped
pricing seam (`buyer-scoped-pricing.ts`), and the Kris purchase-mode authority.

---

## A1 — General self-service accounts (owner: top-right backend, top-left UI)

MUST:
1. **Server-authoritative role.** The browser never decides account type, role, or
   entitlement. Every privileged read/write re-resolves the actor server-side from the
   verified session, never from a request field. NEGATIVE CONTROL: a body carrying
   `role: "admin"` / `organizationId: <foreign>` changes nothing.
2. **Email verification is a real gate.** An unverified account cannot place an order,
   accept an agreement, or read member catalog. Verification tokens are single-use,
   expiring, and constant-time compared. NEGATIVE CONTROL: a reused or expired token
   is refused; a token for email X cannot verify email Y.
3. **No duplicate Auth identity.** Sign-up for an email that already has an Auth user
   (any state) must not create a second identity; it routes to login/recovery. This is
   the same class as the claim-rail single-use guard — reuse that discipline.
4. **Password recovery cannot enumerate.** The response to "reset for <email>" is
   identical whether or not the account exists (no oracle), and the reset token is
   single-use + expiring.
5. **Session integrity.** Logout invalidates server-side; a stale cookie after logout
   authorizes nothing; a session for member X never reads member Y (IDOR at every
   `/account/*` route). NEGATIVE CONTROL: session A requesting org B's dashboard 403s
   and leaks no existence signal (same not-found shape as a missing org).
6. **Approval only where required.** Public/member-safe functionality is reachable
   without a manual claim; only genuinely gated capability (buyer pricing, org admin,
   affiliate, care) requires activation. A general account must never silently inherit
   Roman/KRIS_VOLUME_PARTNER pricing (that stays entitlement-scoped — see A3).

CHOICE (safety-constrained): the exact account-type taxonomy at sign-up, provided each
maps server-side to an explicit, least-privilege role set that defaults to the
narrowest.

I WILL ATTACK: cross-member `/account/context` and org dashboard IDOR; role elevation
via body; verification/reset token reuse, cross-email, and expiry; enumeration oracle
on recovery; duplicate-identity on repeat sign-up; privileged read with a logged-out
cookie.

---

## A2 — Request Quote / Request Item (owner: top-right backend, top-left UI)

MUST:
1. **Durable, never email-only.** Every request persists a row (requester, buyer/org,
   product/variant OR free-form, quantity, intended pathway, notes, status, timestamps)
   before any mail fires. A dropped mail must never lose a request.
2. **No fabricated price, ever.** A `PRICE_PENDING` / unpriced product renders "Request
   quote", creates a request, and NEVER shows `$0`, an inherited price, or another
   buyer's price. NEGATIVE CONTROL: a request row and its member DTO carry no price
   until an admin sets one; a member-facing serialization of an unpriced request never
   contains a numeric amount.
3. **Status is a controlled vocabulary** with server-enforced transitions (reuse the
   `product-requests.ts` `ProductRequestStatus` machine). A member cannot move their own
   request to `priced`/`approved`; only an admin can. NEGATIVE CONTROL: a member PATCH
   to an admin-only status is refused.
4. **Ownership.** A member reads and acts on only their own requests (and their org's
   where authorized); another member's request is not-found, not forbidden-with-detail.
5. **Quote → order conversion is authorized and fresh.** Accepting a quote re-validates
   the current authorized price at conversion (no stale quote honored past expiry, no
   price drift accepted); the placed order goes through the SAME canonical order door
   (no parallel order path). NEGATIVE CONTROL: an expired quote refuses; a quote whose
   admin price changed after issue refuses with a re-quote, never silently charges old.
6. **Privacy.** A request/quote member DTO carries zero supplier/cost/margin/internal
   fields, including in any admin-note echoed back to the member.

CHOICE: request attachment support (safe types only, signature-checked as
`product-requests.ts` already does) — if built, files are private-stored and scanned.

I WILL ATTACK: member-set price/status; cross-member request read; `$0`/inherited price
on unpriced; stale/expired quote acceptance; quote conversion bypassing the order door;
private-field leakage in request/quote DTOs and echoed admin notes.

---

## A3 — Admin pricing control (owner: top-right backend, top-left admin UI)

MUST:
1. **One canonical price authority, profile-scoped.** Prices resolve by
   (product, variant, profile, effective-date), extending the existing founder-release
   ledger + buyer-scoped seam. NO second pricing system. NO global partner-price append
   (that lesson is settled — buyer-scoped only).
2. **Buyer-price isolation at BOTH ends.** A profile price (KRIS_VOLUME_PARTNER,
   org-specific, consumer, member tier) reaches only entitled buyers at catalog
   projection AND is re-authorized at order placement; anonymous, ordinary member,
   Samuel-legacy EA, and a second org each provably do NOT resolve it. (This is the
   contract the pricing door already passed at `d75c41e`; every new profile inherits
   it.) NEGATIVE CONTROLS REQUIRED for each new profile, not just Roman.
3. **No stale/mismatch/$0.** Order commit re-reads the current authorized price;
   mismatch fails closed (`PRICE_CHANGED`) with no fallback to another buyer's price and
   no `$0` from missing data.
4. **Effective dates + audit.** Every price change is versioned with who/why/previous/
   new/effective/expiry and is append-only supersession (no in-place mutation of a price
   an order was placed under — historical order prices are immutable).
5. **Approval state.** A price in draft/unapproved state is never chargeable; only an
   approved, effective price authorizes a sale. NEGATIVE CONTROL: an unapproved or
   future-dated price does not sell.

I WILL ATTACK: cross-profile price leak (each new profile gets the four-persona matrix);
stale price at commit; `$0`/inherited fallback; in-place mutation of a historical price;
selling on a draft/future price; admin pricing routes reachable by a non-admin session.

---

## Cross-cutting (all Release-A surfaces)

- **Outbox idempotency:** every lifecycle mail keys on the business event, so a replay
  or retry never double-sends (the exact property under adversarial review right now for
  order/rejection mail — new mail must adopt the same deterministic-key discipline).
- **Route uniqueness + census:** every new route is method+path unique and the census
  pin moves with its documented explanation.
- **Fresh-clone + typecheck + build** stay green; **no private field** enters any
  member/affiliate/supplier DTO or email body.
- **Fail closed** on every missing dependency (no persistence → refuse with a truthful
  reason, never a permissive default).

Handoff to me = full SHA + focused tests + the negative controls named above. I verify
independently, fold the attack suite in after your commit, and hand lead the verdict.

— bottom-right (QA, Security, Privacy, Observability & Release Defense)
