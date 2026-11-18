# Early Access category intake contract (2026-11-18)

How a category link opens the Early Access catalog, and what it is not allowed to do.

## The four links

| Link | Opens |
| --- | --- |
| `/earlyaccess?category=clinical` | The clinical formulations family (`clinical_formulations_503a`): the whole family, not a peptide subset |
| `/earlyaccess?category=research_peptides` | The research peptides and materials family (`research_peptides_materials`) |
| `/earlyaccess?category=supplements` | The supplements family (`supplements`) |
| `/earlyaccess?category=topicals` | The topical view, across families (below) |

## Reading a link

`catalogCategoryFromSearch` in `shared/research/assisted-order/catalog-category.ts` reads a link strictly.

* It accepts exactly one query key, `category`, once, with one of the four exact values.
* Anything else returns `null`, and the ordinary catalog opens. That includes:
    * an unknown, empty, differently cased or padded value;
    * a repeated key;
    * any extra key;
    * the five-key product link.
* A product link (`family`, `slug`, `variant`, `qty`, `intent`) keeps its own strict parser and takes precedence. The two parsers never both accept one address.

## Lifetime

* **When it is read.** `EarlyAccessRoute` reads the category once, at its first render. That is before admission, intake or any history write can change the address. A later change to the address does not change it.
* **How it reaches the form.** The value is passed down the existing entry chain as the `entryCategory` prop: `OrderRequestEntry`, then `RequestIntentEntry`, then `RequestIntentForm`.
* **Through admission.** The admission gate renders the same form element, so the category survives contact admission.
* **Which session uses it.** It sets the starting view of the first form session only. "Start another request" opens the ordinary catalog.
* **Where it is kept.** It is never written to browser storage or history.
* **What reaches the server.** Only the filter it implies is sent, as `family` or `presentation=topicals` on the catalog read.
* **The legacy order door** ignores it.

## What a category never does

* It grants no admission and skips no step.
* It selects no item and pre-fills no quantity.
* It changes no row's classification, hold, price boundary, availability or action.

The customer can always leave the view:

* the family control returns to all families;
* "Show all products" ends the topical view.

## Topical membership

* **The rule.** The topical view (`presentation=topicals`) lists the rows whose catalog form is `Topical Cream`, `Topical Gel / Serum` or `Topical Serum`, in any family. It is never chosen by a name or an alias.
* **What the form value is.** It is the catalog's own classification. It decides which rows the view lists and makes no claim about any product.
* **The view combines with the family control.** A row must match both.
* **In the shipped dataset,** 31 rows have a topical form:
    * 28 in clinical formulations (26 `Topical Cream`, 2 `Topical Gel / Serum`);
    * 3 in topicals and regenerative (2 `Topical Cream`, 1 `Topical Serum`).
* **Where the exact ids are pinned:** `shared/research/assisted-order/catalog-category.test.ts`.
* **Rows left out.** The five rows whose form is `Solution` are not in the view: four in clinical formulations and the reconstitution solution in research supplies. If a row belongs in the view, its form value is what changes.

## The final action

* The button that sends a new request, and the journey step that names it, read **Submit Request**.
* These stay as they are:
    * "Retry same request", which keeps the same attempt and idempotency key;
    * "Submitting request…";
    * the review-step button;
    * the quote-only price labels.

## Tests

| Path | What it covers |
| --- | --- |
| `shared/research/assisted-order/catalog-category.test.ts` | The parser: all four links, and the malformed and extra-key shapes. The mapping. The exact 31 topical ids. |
| `server/research/assisted-order/request-intent/catalog.test.ts` | The topical view by form across families, combined with a family, and never by name. |
| `server/research/assisted-order/request-intent/catalog-sort-route.test.ts` | `presentation` validation on `GET /catalog`. |
| `client/src/research/assisted-order/request-intent-api.test.ts` | The client sends `presentation`. |
| `client/src/research/assisted-order/RequestIntentForm.category-entry.test.tsx` | All four starting views, nothing selected, clearing the family and the topical view, and product-link precedence. |
| `client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx` | The real route. Each category survives the address losing its query before the form mounts. Malformed links and a product link with a category added open the ordinary catalog. No request is sent. |
| `client/src/research/early-access/request-experience-copy.test.ts` and `client/src/research/assisted-order/request-dock-cta-parity.test.ts` | "Submit Request" on the final action and the journey step. Retry unchanged. |
