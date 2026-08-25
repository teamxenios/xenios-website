# Research home catalog policy

## Current product decision

The public `/research` page may explain the Xenios Research offering and provide a clear
entry point to the canonical catalog at `/research/member/products`. That destination is
not a public catalog: it remains inside `RequireMember`, and the server remains the
authorization authority for catalog data.

The homepage must never render or fetch catalog records, product detail, prices,
inventory, checkout state, member data, or direct product routes. It may describe broad
research areas and the information a member can expect to evaluate. All current product
truth stays in the protected catalog.

This replaces the earlier temporary minimal-gateway rule that prohibited any catalog
entry link. It does not change the access architecture.

This newer founder-directed homepage decision also supersedes only the minimal,
one-viewport Gateway presentation described in the earlier Competitive Code UI Master
Guide. The guide remains authoritative for the rest of Research; its access, restraint,
originality, responsive, and accessibility rules still apply here.

## Required boundary

- Approved catalog destination: `/research/member/products` only.
- The link may appear in the hero, relevant editorial sections, the final call to action,
  the footer, and a responsive sticky action.
- Every instance must resolve to that exact protected route.
- No public product cards, names, SKUs, price claims, inventory claims, or product APIs.
- No links to `/research/products`, `/research/catalog`, `/research/shop`, cart, checkout,
  a product slug, or any `/api/research/*` endpoint.
- No client-side flag, storage value, or query parameter may expose a second version of
  the homepage with catalog data.
- Signed-out, inactive, pending, or otherwise unauthorized visitors who follow the link
  remain subject to the existing member authorization flow.

## Implementation and regression lock

`client/src/research/pages/Gateway.tsx` is the public editorial page. Its catalog route is
declared once as `MEMBER_CATALOG_PATH` and reused by each catalog action. The component
contains no fetch or member-state loading.

`client/src/research/pages/Gateway.catalog-guard.test.tsx` enforces:

1. Every catalog-labelled action uses `/research/member/products`.
2. Direct product, API, cart, checkout, shop, and legacy catalog destinations are absent.
3. Every anchor is in a closed, reviewed destination allowlist.
4. The source contains no fetch, external asset URL, browser-storage branch, or
   environment-flag branch.
5. The same protected catalog destination is rendered at 320, 375, 390, 430, 768, and
   1440 CSS pixels.

The protected route itself remains mounted inside `RequireMember` in
`client/src/research/section.tsx`. Changes to that router, `RequireMember`, member auth,
or server authorization are outside the homepage workstream and require a separate
security review.
