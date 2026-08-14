# Catalog v2 client state, deep links, downloads and reflow

Lane: `lane/catalog-client-state`, worktree `C:\xenios-wt\catalog-client-state`,
based on `d7984eb1cf80dea1da1eeacebe701227a8dd61ba`.

Client side only. No file under `server/` was touched. No client feature flag
was added, and none should be: the display flag, the viewer check and the
founder launch scope are all enforced by the server, which fails closed.

This lane builds on the sibling packet
`docs/research/CATALOG_V2_CLIENT_MOUNT_PACKET.md` (branch
`lane/catalog-v2-client-mount`) rather than proposing a second route table. Its
list route is carried over unchanged; the detail route it identified as an open
decision is now taken and implemented.

## 1. What the URL already did, and what it did not

`useCatalogQueryState.ts` already existed and already worked. Measured on the
clean base, before any change:

| State | In the URL before | After this lane |
|---|---|---|
| Search text `q` | yes | yes |
| Family filter `families` | yes | yes |
| Availability filter `states` | yes | yes |
| Page `page` | yes (omitted at page 1, which is correct) | yes |
| Page size `pageSize` | **no** | yes, bounded |
| Back and forward | yes, through `popstate` | yes |
| Pasted link restores the view | yes for the four it serialized | yes for all five |

Two real gaps, both fixed here.

**`pageSize` was dropped.** `MasterOfferingCatalogQuery` carries it, the catalog
API accepts it, and `masterOfferingCatalogUrl` sends it, but neither
`parseCatalogQueryFromSearch` nor `catalogQueryToSearch` knew about it. A member
who ended up on a larger page could not share or reload that view.

It is now parsed and serialized, bounded to 1 through
`MASTER_OFFERING_MAX_PAGE_SIZE` (100). That ceiling is not a client policy: the
server's `parseMasterOfferingCatalogQuery` **refuses** anything above 100 with
an invalid-request refusal rather than clamping it, so a hand-edited link
carrying `pageSize=5000` would have shown the member a broken catalog. The
browser drops it and asks for the server default instead. The server remains the
authority for what a page size means.

**The search box could not be cleared.** Found by driving the real page, not by
reading it. The handler was:

```ts
const { page: _page, ...rest } = query;
onChange(q.trim() ? { ...rest, q } : rest);
```

`rest` still contained the old `q`, so emptying the box handed back the query it
came from. The old search stayed in the URL and in the results, and there was no
way to clear it short of editing the address bar. The family and availability
selects already destructured their own key out; the search box did not. It now
does, and `url-state.test.tsx` holds it.

Everything else about the hook was already right and was left alone: the closed
vocabulary that means a hand-edited link can narrow but never widen audience,
breadth or commerce; the identical-search guard that stops the back button
stacking duplicate entries; the `popstate` subscription.

## 2. Deep links survive a reload, proved by running

Two levels of proof.

**In a real browser.** A dev harness (see the last section) renders the real
surface with the real stylesheet at a real width. Sequence, all measured live:

```text
1. open   /src/research/master-offerings/__harness__/catalog-harness.html?q=BPC157&families=research_vials&states=available_now&pageSize=2
   ->  search box "BPC157", family "research_vials", availability "available_now"
   ->  card href /research/member/catalog/research_vials/research-vials-bpc-157-1
2. clear the search box, then click Next page
   ->  url ?families=research_vials&states=available_now&page=2&pageSize=2
   ->  "Page 2 of 3", "Showing 2 of 6 offerings"
3. location.reload()      (navigation type reported by the browser: "reload")
   ->  url, page position, result count and first card href all byte identical
   ->  identicalAfterHardReload: true
```

**In tests.** `url-state.test.tsx` drives the real `browserCatalogHistory`
against `window.location` instead of the in-memory history the other catalog
tests use. Every case unmounts and mounts again, so the second mount has nothing
but the address bar, which is exactly what a hard reload gives a page. It covers
the pasted link, the reload after interaction, clearing the search, `popstate`,
the refused page size, and the serialize and parse round trip.

The product detail page needs no cache warming either: it takes its family and
slug from the route and fetches. `catalog-routes.test.tsx` mounts it through a
real wouter `<Route>` at the exact href a card renders.

## 3. The dead link, and the route it needed

Every card linked to `memberOfferingDetailHref(slug)`, which is
`/research/member/products/:slug`, the **v1** member product page. A v2 slug is
family prefixed (`research-vials-bpc-157`) and lives in a different store, so
v1 fetched it, found nothing, re-checked the slug it got back against the one it
asked for, and fell quietly to `unavailable`. Every product in the catalog was a
dead link, and it failed silently.

`MasterOfferingDetailSurface` also needs a **family and** a slug, because the v2
detail API is `/products/:family/:slug`. A link carrying only the slug could not
have restored the product it pointed at even if the page had existed.

The fix, end to end:

```ts
// integration-packet.ts
export const FULL_CATALOG_PATH = "/research/member/catalog";
export function fullCatalogProductHref(family, slug) {
  return `${FULL_CATALOG_PATH}/${encodeURIComponent(family)}/${encodeURIComponent(slug)}`;
}
```

- `MasterOfferingCard` now links there, through a wouter `<Link>` so it is a
  client-side navigation like every other member page. Verified live: clicking a
  card changed the address to
  `/research/member/catalog/research_vials/research-vials-bpc-157-3` with no
  document load.
- `memberOfferingDetailHref(slug)` is **unchanged and still exported**. The v1
  member catalog still links that way, and this lane does not touch it. It now
  carries a comment saying it cannot serve a v2 slug.
- `FullCatalogProductRoute.tsx` (new, this lane) reads both params, validates
  the family against the closed vocabulary, and answers an unknown family itself
  with the honest "not in the catalog" copy rather than sending the server a
  request it will refuse.
- `FullCatalogRoute.tsx` is carried over from the sibling packet unchanged.

### Owner-protected writes

Both are written and verified in this worktree. Flagging them for the
integration owner:

| File | Owner | Change |
|---|---|---|
| `client/src/research/lib/routes.ts` | integration owner | adds `fullCatalog` (from the sibling packet) and `fullCatalogProduct: "/research/member/catalog/:family/:slug"` (this lane) to `MEMBER_ROUTES` |
| `client/src/research/section.tsx` | integration owner | two `lazy()` imports and two `<Route>` lines, both `<L member component=...>` |

```tsx
<Route path="/research/member/catalog/:family/:slug">{() => <L member component={MemberFullCatalogProduct} />}</Route>
<Route path="/research/member/catalog">{() => <L member component={MemberFullCatalog} />}</Route>
```

`client/src/research/pages/Gateway.tsx` is **not** touched, per the founder
directive and its guard test. That test still passes: it denylists a catalog
entry point on `/research`, and registering a member route is not one.
`routes-parity.test.ts` passes, which is the check that the manifest and the
router agree character for character. Registering the path in the manifest also
makes it a valid `safeResearchReturnTo`, so a member who follows a catalog link
while signed out lands back on the catalog.

Not in scope and still open: nothing links to the catalog from the member
navigation, so after the mount it is reachable only by typing the URL. That is
the founder's call while the launch scope is founder and admin.

## 4. The price list download

`MasterOfferingPriceListDownload` rendered both exports as `<a href download>`.
A link download is a browser navigation, and a navigation cannot carry an
`Authorization: Bearer` header. The v2 routes authorize through
`resolveResearchMember`, which is bearer only with no cookie fallback, so both
buttons resolved to no viewer and the browser saved the refusal body to disk as
the price list. The member got a file that was an error, and the page looked
like it had worked.

Rebuilt as an authenticated fetch plus a blob download, following the pattern
this repository already uses in `fetchActivationReconciliationCsv`
(`adapters/adminOps.ts`), `downloadEsignPacket` (`adapters/esign.ts`) and
`fetchDocumentBlob` (`adapters/member.ts`): bearer header, `no-store`,
same-origin, honest failure.

`catalogApi.ts` gained `fetchMasterOfferingPriceList` and
`saveMasterOfferingPriceList`. Three things it does that the anchor could not:

- attaches the member token, which is the whole reason it exists;
- **checks the content type before saving anything**, so the SPA catch-all's
  app shell (200, `text/html` on an unmounted route) is never written to disk as
  a `.csv`;
- maps each refusal onto its own plain-language message: 401 sign in again, 403
  not open to your account yet, 413 too large so narrow the filters, 404 and 503
  not available yet, anything else try again.

The server keeps composing the file, and the filename comes from its
`Content-Disposition` header, accepted only if it is a plain name with the right
extension.

Verified live against the dev server, which answers the unmounted API route
exactly the way production would:

```text
control                 BUTTON, no href, no download attribute
request                 /api/research/catalog-display/v2/price-list?families=research_vials&format=csv
                        Authorization: Bearer <token>        (a link could never send this)
response                200 text/html      (the SPA shell, the unmounted route)
files saved             0                  (the old anchor would have saved this shell as price-list.csv)
status shown            "The price list is not available yet. Please try again later."
```

## 5. Mobile and reflow at 375px

Measured in a real browser at 375 wide, against a product whose display name and
variant label are single unbreakable 60-plus character tokens, which is the
worst case a catalog can produce.

| View | Document scroll width at 375 | Horizontal body scroll |
|---|---|---|
| Catalog list, before | 743px | yes |
| Catalog list, after | 375px, zero elements wider than the viewport | no |
| Product detail, before | 527px | yes |
| Product detail, after | 375px, zero elements wider than the viewport | no |

The "before" numbers were taken by stripping exactly the classes this lane adds
from the live DOM and re-measuring, so they are the same page either way.

Two distinct causes:

**Grid and flex children default to `min-width: auto`.** A long token widened
the track instead of wrapping. Fixed with `min-w-0` on the shrinkable containers
and `break-words` on the text, which is the convention already used in
`catalog-display/CatalogGrid.tsx` and `catalog-display/ProductDetail.tsx`.

**A `<legend>` is sized by its own content and does not shrink.** The "Variants
of `<name>`" legend on the detail page took the whole page to 527px by itself.
It now carries `max-w-full min-w-0 break-words`, and `max-w-full` is the one
that matters.

Also checked: 768px gives the intended two column grid with no horizontal
scroll, and the smallest tap target on the page is 52px tall.

Long text wraps inside its container rather than scrolling, which is the better
answer for a name or a label. Nothing in this surface is a table today. If one
arrives, the repository convention is a `div.overflow-x-auto` wrapper around it,
as in `pages/adminx/CrmSupplierOperations.tsx`.

`mobile-reflow.test.tsx` guards the classes the measurement identified. It is a
guard on a measured finding, not a substitute for measuring: jsdom has no layout
engine and cannot check widths.

## 6. Reproducing the browser evidence

`client/src/research/master-offerings/__harness__/catalog-harness.html` plus
`client/src/research/master-offerings/__harness__/harness.tsx` render the real
surface with the real stylesheet, with the catalog fetch injected, so no member
session or running API is needed. It is dev only: `vite build` builds
`client/index.html` alone, and nothing in the app imports it.

```bash
npx vite dev --port 5174
# then open http://localhost:5174/src/research/master-offerings/__harness__/catalog-harness.html   (add #detail for the product page)
```

Measure overflow in the console:

```js
document.documentElement.scrollWidth > document.documentElement.clientWidth
```

## 7. Checks run

```text
npx tsc                                                          clean
npx vitest run client/src/research/master-offerings              14 files, 100 tests, all passed
                                                                 (base was 9 files, 74 tests)
npx vitest run client/src/research/routes-parity.test.ts         passed
npx vitest run Gateway.catalog-guard, ui/shells, robots-reassert,
               client/src/care, research/lib, catalog-display    20 files, 213 tests, all passed
```

Tests added: `url-state.test.tsx`, `price-list-download.test.tsx`,
`catalog-routes.test.tsx`, `mobile-reflow.test.tsx`.

Tests changed, and why:

- `full-catalog.test.tsx` asserted the download anchors' `href`. The control is
  a button now, so it asserts that instead, plus that the export URL still
  composes the same filters. The "no purchase action on a card" assertion was
  scoped to the card, which is what it was always about; it had been counting
  every button on the page.
- `accessibility.test.tsx` required exactly one `aria-live` region. The download
  status is a second one. It now asserts that every live region is polite, which
  is the actual rule the test was written to protect.

Known pre-existing red, not this lane's and not touched:
`server/research/master-offerings/catalog-boundaries.test.ts` times out at
5000ms when the whole server folder runs in parallel.

## 8. What could not be determined here

- The catalog has never been exercised against the real API with a real member
  session. Everything above is the client half. The research wall answers
  `/catalog-display/v2/` before the catalog's own viewer check, which the
  sibling packet records as an open decision for the wall's owner, so a bearer
  only member may still see "please sign in" on a mounted route.
- The detail page mounts without a cart. `MasterOfferingDetailSurface` takes an
  optional cart handoff and this route passes none, so an `add_to_cart` action
  renders its button and does nothing. Wiring the existing cart is a separate
  lane, and it is a deliberate hole rather than an oversight.
- Whether the catalog should appear in the member navigation is a founder
  decision, not a client one.
