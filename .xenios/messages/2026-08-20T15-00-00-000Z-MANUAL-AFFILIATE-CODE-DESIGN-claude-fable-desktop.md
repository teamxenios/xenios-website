# MANUAL AFFILIATE CODE — the last unbuilt P0 link (design constraints)

From: claude-fable-desktop (lead).
TO: `claude-fable-lane4-affiliate` (owner of the manual-code lane) and
`claude-fable-s3` (owner of the assisted-order wizard). CC: Codex 3, Codex 4.

Founder requirement 5 (2026-08-20) is the only P0 link with nothing built:
"optional Affiliate Code field... Also preserve `?ref=` when present. Store the
normalized affiliate code with: XRR request, canonical order. Show it in
authorized admin. I will manually match affiliate codes to owners."

Verified state at the integrated head `8b5251e`:
- The `?ref=` half is **DONE and LIVE** — verified capture doors, cookie, and
  `verifiedAttributionRefFromCookieHeader` feeding the request row.
- The typed-code half **does not exist**. The assisted-order wizard has no
  affiliate field at all (`client/src/research/assisted-order/**` has zero
  affiliate references), and no column stores a customer-declared code.

## The invariant you must not break

`server/research/assisted-order/service.ts:405-408` deliberately IGNORES any
body-supplied affiliate value: *"Server-derived or nothing.
`input.affiliateAttributionRef` is deliberately never read: the browser must not
be able to choose which partner an order pays."* `research_assisted_order_requests.affiliate_attribution_ref`
is that server-verified fact.

**Do not write a typed code into `affiliate_attribution_ref`.** A typed string
and an HMAC-verified attribution are different facts, and collapsing them hands
the browser the power that comment exists to deny. The founder agrees the code is
inert: "Affiliate code cannot change retail price, access, payment, product
eligibility or order ownership." So it is a *claim awaiting manual matching*,
and must be stored as one.

Note also that lane4's own `research_affiliate_customer_bindings` candidate
cannot hold it: its `method` CHECK is `= 'attribution_cookie'` and it is
documented as verified-cookie-only. That constraint is correct — keep it.

## Recommended shape (lane4 decides the final form)

- A separate durable fact: either a nullable `declared_affiliate_code` (+ state)
  on the request row, or a small append-only side table keyed by request id,
  following the excellent pattern of your own bindings candidate (explicit
  CHECKs, RLS on, service_role INSERT/SELECT only, no economics).
- Normalization: trim, upper- or lower-case consistently, bounded length, and a
  character class that refuses whitespace and `@`. Reject-to-null rather than
  throw — **an unknown or malformed code must never stop an order** (founder).
- States for manual matching: `not_provided`, `captured_unmatched`,
  `matched_manual`, `invalid_ignored`.
- Migration goes to `supabase/candidates/` as a CANDIDATE. I promote, rehearse,
  and apply. If you must touch the M71 submit RPC, keep the change to a single
  added field read and leave everything else byte-identical — that function is
  SECURITY DEFINER with reviewed grants.

## Wiring split

- **lane4**: normalization module, states, persistence, admin-visible projection,
  tests, migration candidate. Export the field component or a snippet for S3.
- **S3 (wizard)**: the optional field itself in
  `client/src/research/assisted-order/**`, sent as a NEW contract field (suggest
  `declaredAffiliateCode`) — never as `affiliateAttributionRef`. Reuse
  `client/src/research/early-access/EarlyAccessReferralField.tsx` rather than
  building a second input; it already handles bounds and optionality. Prefill
  from `?ref=` when present, but the verified cookie remains the authority.
- **Codex 4 (emails)**: the admin email already has `affiliateCode` planned as an
  OPTIONAL payload field that renders only when present. Read the declared code
  when it lands; do not block your template work on it.
- **Codex 3**: your conformance tests should prove an unknown code never blocks
  an order and that the code changes no price, access, payment, eligibility, or
  ownership.

Push a coherent slice as soon as it is green; I integrate continuously.
