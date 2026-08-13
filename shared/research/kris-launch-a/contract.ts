/**
 * Kris Launch A browser contract.
 *
 * THE SHAPE, AND WHY IT IS THREE LAYERS
 * -------------------------------------
 * A canonical product, a price overlay keyed by pricing profile, and an access
 * policy derived from the product's channel. They are separate because they
 * have different owners and different lifetimes. Kris's prices arrive in his
 * own workbook and must not overwrite a consumer price that does not exist
 * yet; a future DEFAULT profile is another overlay against the same products,
 * not a second catalog. Access policy is neither: it is a rule about what a
 * channel permits, and it belongs in code where it can be tested, not in a
 * spreadsheet cell that a supplier edit could quietly change.
 *
 * This contract carries no supplier identity, buy cost, margin, saving,
 * alternative supplier, sourcing rationale, source file or supplier note. It
 * also carries no `Suggested Sell Price`: that is the master catalog's own
 * number and it is NOT what Kris pays.
 *
 * Launch A sells nothing. There is no add-to-cart action in this union at all,
 * so no surface built on it can render one by accident.
 */

export const KRIS_CHANNELS = [
  "clinical_provider_only",
  "ruo_research",
  "classification_pending",
  "supplement",
  "nonclinical_topical",
] as const;

export type KrisChannel = (typeof KRIS_CHANNELS)[number];

export const KRIS_CHANNEL_LABELS: Readonly<Record<KrisChannel, string>> = {
  clinical_provider_only: "Clinical / Provider Only",
  ruo_research: "RUO Research",
  classification_pending: "Supplier Catalog / Classification Pending",
  supplement: "Supplement",
  nonclinical_topical: "Nonclinical / Topical",
};

export const KRIS_FAMILIES = [
  "clinical_formulations_503a",
  "research_capsules",
  "research_peptides_and_materials",
  "research_supplies",
  "shipping_and_fulfillment",
  "supplements",
  "topicals_and_regenerative",
] as const;

export type KrisFamily = (typeof KRIS_FAMILIES)[number];

export const KRIS_FAMILY_LABELS: Readonly<Record<KrisFamily, string>> = {
  clinical_formulations_503a: "503A Clinical Formulations",
  research_capsules: "Research Capsules",
  research_peptides_and_materials: "Research Peptides & Materials",
  research_supplies: "Research Supplies",
  shipping_and_fulfillment: "Shipping & Fulfillment",
  supplements: "Supplements",
  topicals_and_regenerative: "Topicals & Regenerative",
};

/**
 * The pricing profile a viewer is entitled to.
 *
 * Launch A ships exactly one. A future consumer profile is added here and as
 * another overlay in the artifact, and no product record changes.
 */
export const KRIS_PRICE_PROFILES = ["KRIS_VOLUME_PARTNER"] as const;
export type KrisPriceProfile = (typeof KRIS_PRICE_PROFILES)[number];

/**
 * A price, or an honest absence.
 *
 * `pending` is a real state with its own copy. It is never zero, never an empty
 * string rendered as currency, and never a guess: two of the 420 items have no
 * price yet and the buyer is told exactly that.
 */
export type KrisPriceView =
  | {
      state: "priced";
      amountCents: number;
      currency: string;
      display: string;
      /** How the price is measured, straight from the sheet. */
      basis: string;
    }
  | { state: "pending"; display: "Price pending" };

export const KRIS_PRICE_PENDING: KrisPriceView = {
  state: "pending",
  display: "Price pending",
};

/**
 * What a channel permits, and what the buyer must be told.
 *
 * `purchasable` is present and always false. It is written down rather than
 * omitted so that a future change has to edit a field called purchasable in a
 * file called access-policy, instead of quietly gaining an action.
 */
export interface KrisAccessPolicy {
  channel: KrisChannel;
  statusLabel: string;
  notices: readonly string[];
  purchasable: false;
}

export interface KrisCatalogItemView {
  id: string;
  slug: string;
  displayName: string;
  specification: string;
  family: KrisFamily;
  familyLabel: string;
  channel: KrisChannel;
  channelLabel: string;
  format: string;
  packBasis: string;
  moq: number | null;
  dosageForm: string | null;
  price: KrisPriceView;
  access: KrisAccessPolicy;
  /**
   * The note supplied on the row, shown as given.
   *
   * It is displayed IN ADDITION to the channel notices, never instead of them.
   * The two price-pending rows carry "Price pending." here in place of their
   * channel text, so a surface that trusted this field alone would drop
   * "Research use only" from BAM15 and "Provider workflow required" from the
   * syringes. The policy above is what guarantees those survive.
   */
  suppliedNote: string;
}

export interface KrisCatalogDetailView extends KrisCatalogItemView {
  disclosures: readonly string[];
}

export const KRIS_SORTS = [
  "relevance",
  "name_asc",
  "name_desc",
  "price_asc",
  "price_desc",
] as const;
export type KrisSort = (typeof KRIS_SORTS)[number];
export const DEFAULT_KRIS_SORT: KrisSort = "relevance";

export interface KrisCatalogQuery {
  q?: string;
  families?: readonly KrisFamily[];
  channels?: readonly KrisChannel[];
  sort?: KrisSort;
  page?: number;
  pageSize?: number;
}

export interface KrisFacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface KrisCatalogFacets {
  families: readonly KrisFacetBucket[];
  channels: readonly KrisFacetBucket[];
}

export interface KrisCatalogPage {
  ok: true;
  profile: KrisPriceProfile;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: KrisSort;
  facets: KrisCatalogFacets;
  items: readonly KrisCatalogItemView[];
}

export type KrisCatalogErrorResponse = {
  ok: false;
  code:
    | "kris_catalog_disabled"
    | "kris_catalog_auth_required"
    | "kris_catalog_forbidden"
    | "kris_catalog_invalid_request"
    | "kris_catalog_not_found"
    | "kris_catalog_unavailable";
};

export function isKrisChannel(value: unknown): value is KrisChannel {
  return (
    typeof value === "string" && (KRIS_CHANNELS as readonly string[]).includes(value)
  );
}

export function isKrisFamily(value: unknown): value is KrisFamily {
  return (
    typeof value === "string" && (KRIS_FAMILIES as readonly string[]).includes(value)
  );
}

export function isKrisSort(value: unknown): value is KrisSort {
  return typeof value === "string" && (KRIS_SORTS as readonly string[]).includes(value);
}

export function isKrisPriceProfile(value: unknown): value is KrisPriceProfile {
  return (
    typeof value === "string" &&
    (KRIS_PRICE_PROFILES as readonly string[]).includes(value)
  );
}
