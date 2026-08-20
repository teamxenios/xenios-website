# Research home catalog policy

## STATUS: SUPERSEDED IN PART, 2026-08-19 — AWAITING FOUNDER CONFIRMATION

This document previously recorded a nonnegotiable directive that there must be
**no public catalog entry point of any kind** on the `/research` home page. The
2026-08-19 launch directive ("PUBLIC STOREFRONT + ORDER ENTRY") reverses that
for one specific, newly built surface:

> MAKE THE LANDING PAGE COMMERCIAL.
> Primary CTA: Browse Research Catalog
> Secondary CTA: Member Sign In

**These two directives cannot both hold.** The newer one is implemented on
branch `lane/launch-public-storefront` in its own isolated commit so it can be
dropped whole if the reversal was not intended. Until Samuel confirms the
reversal in a session of record, treat the Gateway CTA as PROPOSED, not
settled. See `.xenios/FOUNDER_ACTIONS.md`.

What did NOT change: everything below about member-private, partner, supplier,
and admin catalog surfaces. Those remain forbidden on the public Gateway, and
the guard still enforces them.

## The original directive (historical, for the record)

Samuel's directive, restated exactly as it stood before 2026-08-19: there must
be no "Research Catalog" button, card, tile, hero CTA, navigation CTA, or
equivalent public catalog-entry control on the `/research` home page. This was
recorded as a repeated nonnegotiable, not a one-time cleanup. The rationale on
the record: no way to see catalog contents, pricing, or SKUs without first
applying and being approved, or signing in as an existing member.

## What changed materially, and why the reversal is coherent

The original policy was written when there was no public catalog to link to.
Every catalog surface in the repository was member-private, partner-gated, or
admin-only, so a "catalog" CTA on the Gateway could only have meant exposing
one of those. That is still forbidden.

The launch build adds something that did not exist when the policy was
written: a **public storefront projection** at `/research/catalog`, served by
`/api/research/storefront/*`, with these properties.

- It is a projection, not an authority. It reads through the same canonical
  master-offerings catalog service the member surface uses, composed for a
  viewer with **no pricing grant**, so it can only ever show what the server
  already says to a viewer who has proven nothing.
- It carries **no SKU, no Product Control identity, no price provenance, and
  no member hrefs** — enforced field by field in
  `server/research/storefront/projection.ts` and pinned by its tests.
- A price appears only where the server supplied one. There is no zero, no
  placeholder, and no client-side fallback amount anywhere in the contract.
- It sells nothing. A signed-out visitor cannot add to a cart or check out;
  every action routes to sign-in, to a request path, or to Care.
- It fails closed behind `RESEARCH_PUBLIC_STOREFRONT_ENABLED`, which must be
  exactly `"true"`. Unset, every door answers `storefront_closed` and the page
  renders its "not open yet" state.
- The tree remains **noindex**: the routes send `X-Robots-Tag: noindex,
  nofollow` and the section router asserts the meta tag (SEN-0027). Publicly
  reachable is not publicly indexed.

So the question the original policy answered ("should an unapproved visitor be
able to browse member catalog contents, pricing and SKUs?") is still answered
**no**. The new question ("may an unapproved visitor browse a fail-closed
public projection that sells nothing?") is what the 2026-08-19 directive
answers yes to.

## Where catalog access legitimately lives

Public, and permitted on the Gateway:

- **Public storefront.** `/research/catalog` and
  `/research/catalog/:family/:slug`, described above. Fail-closed, noindex,
  non-transacting.

Never public, and still forbidden on the Gateway:

- **Authenticated member workspace.** `/research/member/products`, the v2
  member catalog `/research/member/catalog[/:family/:slug]`, and the
  cart/checkout/orders/subscriptions family under `/research/member/*`. All
  behind `RequireMember`.
- **Authorized partner views.** `/research/partners/*`, password-gated, its own
  shell.
- **Supplier operational views.** `client/src/research/operations/` and the
  commerce/inventory adminx pages.
- **Product Control (admin).** `/admin/research/*`, forced RLS, service-only
  privileges, no public reachability.
- **Admin Research home.** `/admin/research`.

A visitor reaches any of the forbidden set only by applying and being approved,
by a separate authorized partner/staff login, or by internal admin access.

## What the guard checks now

The regression lock lives in
`client/src/research/pages/Gateway.catalog-guard.test.tsx`, run as part of
`client/src/research/pages/` in CI. Its layers are unchanged in structure; what
moved is exactly one href and one route string, from "forbidden" to
"reviewed and allowed", plus a new positive assertion.

1. **DOM denylist.** Renders Gateway in jsdom and inspects every real `<a>` and
   `<button>`: accessible name, visible text, `href`, and `data-testid`,
   against an href-pattern denylist covering `/research/products`,
   `/research/member/catalog`, `/research/supplements`,
   `/research/member/products`, and anything containing `catalog-display`.
   `/research/catalog` is deliberately NOT on it any more, and the exact-match
   patterns are anchored so `/research/catalog` cannot be read as permission
   for `/research/member/catalog`.
2. **DOM closed allowlist.** The page may contain only a known-good exact set
   of anchors, now including `/research/catalog`, and zero `<button>` elements.
   Any other addition still fails review.
3. **Responsive / feature-flag dimension.** `Gateway.length === 0`, a
   source-text scan proving Gateway reads no flag, env, storage, or context
   API, and a re-render of the denylist check across five viewport widths.
4. **Source-level route guard.** Reads the raw text of `Gateway.tsx` for the
   denylisted route strings, catching a link written inside a branch the
   render never takes.
5. **NEW — the storefront CTA is present and correct.** The reversal is
   asserted positively, not merely permitted: the Gateway must link to
   `/research/catalog` exactly once, as a primary CTA, alongside Member Sign
   In. If someone later removes it by accident, that fails too. This is what
   keeps the page's commercial intent from silently regressing the other way.

## How to extend the guard

If a legitimate new Gateway CTA is proposed:

1. Confirm it is not member-private, partner, supplier, or admin catalog access
   under a different name. If it leads to member product listings, member
   pricing, SKUs, or any authenticated surface, it does not belong on Gateway.
2. Add its `href` to `ALLOWED_HREFS` with a short comment explaining what it is.
3. If it reads a new prop or flag, update the "declares zero parameters" and
   "reads no flag" tests to enumerate that prop/flag explicitly and render
   Gateway under every value.
4. Update this document so the written policy still matches the real page.
5. Do not widen or remove a denylist href pattern or route string to make a new
   CTA pass. The 2026-08-19 change to `/research/catalog` was not a widening to
   fit a CTA: it is a founder-directed reversal for a surface that did not
   exist when the denylist was written, recorded here with its rationale and
   its open confirmation item.
