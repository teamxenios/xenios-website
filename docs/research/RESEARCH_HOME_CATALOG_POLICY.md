# Research home catalog policy

## The directive

Samuel's directive, restated exactly: there must be no "Research Catalog" button, card,
tile, hero CTA, navigation CTA, or equivalent public catalog-entry control on the
`/research` home page. This is a repeated nonnegotiable, not a one-time cleanup.

`/research` renders `client/src/research/pages/Gateway.tsx` (mounted at that path in
`client/src/research/section.tsx`). Gateway is a restrained access hub for an
unauthenticated visitor. Member sign-in and membership application are the only primary
buttons. Recovery and application status are secondary text actions. Partner,
organization, supplier, and private/invited access are grouped behind one native
progressive-disclosure control. Privacy, Terms, application status, and Admin / Internal
remain quiet footer links.

Those links are discovery, not authorization. Each destination must still verify its
own canonical Supabase identity and server-authorized membership, role, invitation, or
cohort state. The hub never grants a role and never creates a second password system.
Organization and supplier links lead to support until their canonical account routes
exist; they must not invent a portal or pretend one is live.

The original catalog prohibition is unchanged: no navigation, product grid, "browse
before you apply" path, or way to see catalog contents, pricing, or SKUs belongs on the
public Gateway. The policy and its guard tests exist to preserve that boundary while
allowing truthful access discovery.

## Where catalog access legitimately lives instead

The catalog is real and reachable, just never from the public home page:

- **Authenticated member workspace.** `/research/member/products` (`MemberProducts`,
  `client/src/research/pages/member/Products.tsx`) is the actual, current member
  catalog route. It sits behind `RequireMember` (`client/src/research/pages/MemberArea.tsx`),
  so it only renders for a signed-in, active member. Related member-only surfaces:
  `/research/member/supplements`, `/research/member/metabolic-care`,
  `/research/member/diagnostics`, and the cart/checkout/orders/subscriptions family
  under `/research/member/*`.
- **Authorized partner views.** The Research Rep / affiliate family under
  `/research/partners/*` has its own links and resources. Gateway may link to the public
  program landing and application pages, but never directly to the partner dashboard;
  the portal remains a separately authorized surface.
- **Supplier operational views.** `client/src/research/operations/` (for example
  `MitchPortal.tsx`, `OperationsCommandCenter.tsx`) and the commerce/inventory adminx
  pages are operational surfaces for suppliers and staff, gated separately from the
  public site. Gateway may offer supplier access help, but it must not link an
  unauthenticated visitor into those operational pages or label support as a login.
- **Product Control (admin).** The `/admin/research/*` family (`adminx-section.tsx`),
  including `/admin/research/products` (`ProductsAdmin`), `/admin/research/inventory/*`,
  and `/admin/research/commerce-queues`, is the Product Control center: forced RLS,
  service-only privileges, no public reachability at all.
- **Admin Research home.** `/admin/research` (`AdminResearchHome`) is the internal
  admin landing page for the whole Research admin family. A quiet internal-entry link
  may be public, but it grants nothing; the admin surface's server authorization remains
  the boundary.

No Gateway link may bypass the destination's own authentication or authorization. No
member, partner, organization, supplier, or admin data becomes reachable merely because
its access entry is discoverable.

## What the guard checks

The regression lock lives in
`client/src/research/pages/Gateway.catalog-guard.test.tsx`, run as part of
`client/src/research/pages/` in CI. It has three independent layers:

1. **DOM denylist.** Renders Gateway in jsdom and inspects every real `<a>` and
   `<button>` it produced: accessible name, visible text content, `href`, and
   `data-testid`, each checked against a phrase denylist (`"research catalog"`,
   `"catalog"`, `"browse products"`, `"shop"`, `"view products"`,
   `"product catalog"`, `"see catalog"`, `"enter catalog"`) and an href-pattern
   denylist (`/research/products`, `/research/catalog`, `/research/member/catalog`,
   `/research/supplements`, `/research/member/products`, and anything containing
   `catalog-display`). The assertion is that zero elements match, and a failure names
   every offending element.
2. **DOM closed allowlist.** Beyond the denylist, a second test asserts the page
   contains only a known-good, exact set of anchors: the wordmark home link; member
   apply, sign-in, recovery, and application status; partner public landing and apply;
   support; Privacy and Terms; the gated Private Early Access door; and the quiet
   internal admin entry. It also requires zero `<button>` elements. This catches any
   *new* element even if its wording never matches the denylist above; any addition to
   the Gateway page has to be reviewed against this file first.
3. **Responsive / feature-flag dimension.** jsdom has no layout engine, so the tests do
   not pretend to measure real visibility at a given screen size. What they do
   honestly check: `Gateway.length === 0` (it declares no props today, so there is no
   prop to vary), a source-text scan proving Gateway reads no flag, env, storage, or
   context API (`useContext`, `useFeatureFlag`, `useFlag`, `import.meta.env`,
   `process.env`, `localStorage`, `sessionStorage`, `useSearch`, `useParams`,
   `matchMedia`), and a re-render of the same DOM denylist check after setting
   `window.innerWidth` to a narrow (375) and a wide (1920) value.
4. **Source-level route guard.** Independent of anything jsdom renders, a test reads
   the raw text of `Gateway.tsx` and checks it for the same denylisted route strings.
   This exists because a link written inside a branch the render never takes (a flag
   check, a dev-only block) would never appear in the DOM checks above but would still
   ship. A DOM check and a source check are both kept because each misses what the
   other catches: the DOM check misses unreached branches, the source check misses an
   href assembled at runtime from a variable rather than written as a literal.

## How to extend the guard

If a legitimate new, genuinely non-catalog Gateway CTA is ever proposed (for example, a
third access-family link that is not a catalog entry point):

1. Confirm it is not catalog access under a different name. If it leads to product
   listings, pricing, SKUs, or anything a non-member/non-partner should not browse, it
   does not belong on Gateway at all; route it through the member workspace, partner
   portal, or admin surfaces above instead.
2. Add its `href` to the `ALLOWED_HREFS` set in the DOM closed-allowlist test in
   `Gateway.catalog-guard.test.tsx`, with a short comment explaining what it is.
3. If it reads a new prop or flag, update the "declares zero parameters" and "reads no
   flag" tests to instead enumerate that prop/flag explicitly, and render Gateway under
   every value it can take, asserting the DOM denylist and allowlist checks stay clean
   for each value.
4. Update this document's access-hub description and the list above so the written
   policy still matches the real page.
5. Do not widen or remove a denylist phrase, href pattern, or route string to make a
   new CTA pass. If a legitimate CTA's wording collides with the denylist (for example
   it happens to contain the word "shop"), rename the CTA; the denylist protects
   against exactly that ambiguity.
