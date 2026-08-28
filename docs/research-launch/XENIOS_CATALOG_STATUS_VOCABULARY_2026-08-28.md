# Xenios catalog status vocabulary and status-to-CTA matrix (2026-08-28)

Helper: CATALOG. Base Lead SHA `77d3f69f3966e76bb733165ee9c7732ccc78730d`.
This documents what the shared contracts at HEAD actually say, how the launch
mandate's seven words map onto them, and what the member catalog UI renders
for each. HEAD wins wherever the mandate and HEAD differ; the differences are
listed, not papered over.

## Three vocabularies exist at HEAD; the browser owns none of them

| Vocabulary | Where | Members | Who produces it |
| --- | --- | --- | --- |
| Catalog display state (9) | `shared/research/master-offerings/contract.ts` → `MASTER_OFFERING_DISPLAY_STATES` | `available_now`, `available_this_week`, `request_access`, `approval_required`, `temporarily_unavailable`, `coming_soon`, `care_pathway`, `planned`, `unavailable` | Server dataset + `resolveMasterOfferingAction` |
| Product activation status (7) | `shared/research/product-activation/contract.ts` → `PRODUCT_ACTIVATION_STATUSES` | `live`, `request_only`, `provider_required`, `verbally_confirmed_pending_documentation`, `pending_pharmacy_activation`, `held`, `unavailable` | Server (`resolveActivationStatus`, monotonic: an overlay may only restrict) |
| Customer action (6) | `shared/research/launch/customer-action.ts` → `CUSTOMER_ACTIONS` | `BUY_NOW`, `REQUEST_QUOTE`, `ASSISTED_ORDER`, `CARE`, `TEMPORARILY_HELD`, `NOT_AVAILABLE` | Pure adapter over the server-resolved action; restate or downgrade only |

## The mandate's seven words, mapped onto HEAD

Mandate: `live | request_only | provider_required | documentation_pending | held | unavailable | unknown`.

| Mandate word | HEAD activation status | HEAD display state(s) that project it (`baseStatusFromDisplayState`) | Difference from the mandate |
| --- | --- | --- | --- |
| `live` | `live` | `available_now` | None. Note `live` alone never yields a purchase: the server also needs a durable exact product+variant activation authority to emit `add_to_cart`. |
| `request_only` | `request_only` | `available_this_week`, `request_access` | None. |
| `provider_required` | `provider_required` | `care_pathway`, `approval_required` | None in name. HEAD also refuses direct purchase by FAMILY (`PROVIDER_PATHWAY_FAMILIES`), which the mandate does not mention. |
| `documentation_pending` | **two** statuses: `verbally_confirmed_pending_documentation`, `pending_pharmacy_activation` | none directly; only an overlay can produce them, and only downward from a base | **HEAD splits this word in two** (verbal-only vs documented-but-incomplete/unapproved). Both are non-orderable. No catalog display state maps to either, so a member catalog card never shows a "documentation pending" state today; it shows the base display state the overlay restricted from. |
| `held` | `held` | `temporarily_unavailable` (and any overlay `held: true`) | None. |
| `unavailable` | `unavailable` | `coming_soon`, `planned`, `unavailable` | **HEAD folds `coming_soon` and `planned` into `unavailable`** at the activation level while keeping them distinct display states with distinct labels ("Coming Soon", "Planned"). The UI renders the display label, so a member sees the finer word. |
| `unknown` | *(no member)* — `baseStatusFromDisplayState` returns `unavailable` for any string outside the closed set | any unrecognized value | **HEAD has no `unknown` status.** Unknown fails closed to `unavailable`. The mandate's "unavailable/unknown; no permissive action" is satisfied by construction. |

The 677117af "seven-state parser" (`shared/research/master-offerings/presentation-contract.ts` in
the unpushed discovery-completion worktree) defines exactly the mandate's
seven words plus a six-value access path. It was **not replayed** here: it has
no producer at HEAD (a DTO nothing on the server emits), and the client is
forbidden from synthesizing an activation status. The equivalent
presentation behaviour — an access-path filter, fail-closed CTA agreement
between state and action, distinct empty/no-results/error states — was
replayed onto the mounted master-offerings surface using HEAD's own
vocabularies instead. See `client/src/research/master-offerings/catalog-access-path.ts`.

## Status-to-CTA matrix as rendered by the member catalog at HEAD + this helper

The card and the detail page render the server-resolved `variant.action`.
They resolve nothing. The rows below are what each state may show, and
`status-cta-matrix.test.tsx` tests every row positively and negatively.

| Display state | Activation | Server may send | Card renders | Detail renders | Never renders |
| --- | --- | --- | --- | --- | --- |
| `available_now` | live | `add_to_cart` (only with durable authority), or any request/none | **Buy Now** as a link to the detail page when price is usable; **Price on request** when the price view is on-request | quantity input + **Add to Cart**, enabled only with a matching `AcceptedExactVariantQuantityCapability` AND an injected cart; otherwise disabled with the stated refusal | a card-level add; a Buy Now with no price; an enabled Add to Cart without capability or cart |
| `available_this_week`, `request_access` | request_only | `request_access`, `request_early_access_purchase`, `apply` | the server's label as a link (`ASSISTED_ORDER`, or `REQUEST_QUOTE` when unpriced) | same link | Buy Now; Add to Cart; quantity |
| `care_pathway`, `approval_required` | provider_required | `explore_care` | **Explore Care** link (`CARE`) | same link | Buy Now; Add to Cart; a plain request that skips Care |
| `temporarily_unavailable` | held | `notify_me`, `join_waitlist`, `none` | state in words + notification link (`TEMPORARILY_HELD`), or **Not available** | same, or "nothing to request right now" | any order action |
| `coming_soon`, `planned`, `unavailable` | unavailable | `get_updates`, `none` | **Get Updates** link (`NOT_AVAILABLE`) or **Not available** | same | any order action; any permissive path |
| *(any state)* + `add_to_cart` where state ≠ `available_now` | contradiction | *should be impossible* | **Not available** (`mo-card-contradiction`); no link | disabled Add to Cart, refusal names the listing state (`mo-state-refusal`); no quantity | an enabled purchase |
| unrecognized state | unavailable (fail-closed) | — | the DTO cannot carry one (closed type); `baseStatusFromDisplayState` → `unavailable` | — | anything permissive |

## What the UI never claims

- No stock, lead time, or "ships today" statement; availability is the display
  label and the server's `stateExplanation`, verbatim.
- No wholesale, cost, margin, or supplier price; only the approved retail
  `price.display` or "Price on request". `$0.00` is never rendered.
- No product-specific documentation, lot, COA, or storage claim
  (`CatalogEvidenceNotice` states only what the DTO cannot prove).
- No clinical claim; the access-path copy is checked for this in
  `catalog-access-path.test.ts`.

## Filters and discovery at HEAD + this helper

| Control | Persisted in URL | Source of vocabulary |
| --- | --- | --- |
| Search `q` (debounced 250 ms, `replace`) | yes | free text ≤160 |
| Family | yes (`families`) | closed contract |
| Category | yes (`categories`) | server facet response |
| Listing state | yes (`states`) | closed contract |
| Sort | yes (`sort`) | closed contract |
| Page / page size | yes | server bounds |
| Active-filter chips (remove one) | derived from the URL query | same words as the controls |
| **Next step, on this page** (access path) | **no** — page-local | six-word customer vocabulary derived from the server action |
| Strength / format | **not supported** — search matches variant labels | — |

Strength/format and access-path are not server facets at HEAD; adding them
requires the shared query contract and the server facet counter, which are
outside this helper's boundary. The exact snippet is in the helper handoff.
