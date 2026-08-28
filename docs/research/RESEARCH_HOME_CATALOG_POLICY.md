# Research home catalog policy

## Binding boundary

The public `/research` homepage may explain Xenios Research, documentation,
quality principles, access relationships, and the separate Care pathway. It
must never expose a public catalog entry point: no product grid, SKU, price,
availability claim, “Research Catalog” control, “browse products” equivalent,
or link to a member catalog route.

The current editorial homepage routes its primary action to the public Access
Hub at `/research/access-hub`. Its other public doors are informational or
account/access routes:

- `/research/about`
- `/research/how-it-works`
- `/research/faq`
- `/research/policies`
- `/research/policies/accessibility` (the Accessibility Statement, an operational draft; a notice, never a catalog door)
- `/research/organizations`, `/research/partners`, `/research/affiliates` (exact informational B2B roots; Partner Apply, descendants, referral capture, and economics remain closed)
- `/research/contact`
- `/research/support`
- `/research/apply`
- `/research/sign-in`
- `/research/early-access`
- `/care`, as a separate provider-governed pathway

These routes do not make catalog data, prices, current inventory, provider
approval, clinical status, or pharmacy status public. The Early Access surface
retains its independent server authority and does not make the homepage a
catalog.

## Legitimate catalog locations

Catalog and commerce views remain behind their own durable authority:

- authenticated member routes under `/research/member/*`;
- explicitly authorized Early Access projections and writes;
- separately authenticated partner, supplier, or operational workspaces; and
- internal Product Control routes under `/admin/research/*`.

Being linked from a public informational page never grants any of those roles.
The server-resolved action and evidence state remains authoritative even after
a protected route becomes reachable.

## Regression lock

`client/src/research/pages/Gateway.catalog-guard.test.tsx` enforces the boundary
at both rendered-DOM and source levels. It:

1. rejects catalog/product/shop language and protected catalog destinations;
2. checks every homepage anchor against a closed, reviewed public allowlist;
3. confirms the page reads no browser-authored role or feature authority;
4. reruns the guards at representative narrow and wide viewport values without
   pretending jsdom performs layout; and
5. protects the exact warm-silver editorial asset and public access door.

Responsive behavior is separately pinned by structural CSS tests and must be
proven in a real browser before release.

## Change rule

A new homepage action may be admitted only when all of the following are true:

- it is informational or enters an independently governed access flow;
- it exposes no product, price, SKU, or availability data;
- it is added to the closed allowlist with an explicit rationale;
- route, manifest, access, privacy, indexing, and browser evidence are updated
  atomically; and
- the catalog denylist is not weakened to accommodate it.

If an action leads to product listings or commerce, place it behind the
applicable authenticated/server-authorized surface instead of the public home.
