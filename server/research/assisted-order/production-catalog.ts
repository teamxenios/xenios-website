// The assisted-order catalog over the canonical master-offerings authority.
//
// No copied product list: every row comes from the same member-safe
// master-offerings service the v2 catalog doors serve, priced by the same
// price authority, and mapped to Product Control identities through the same
// reviewed binding artifact. The mapping is projection only; visibility,
// pathway, and price decisions stay with the canonical systems and the
// shared action policy.
//
// Pathway truth from the normalized channel presentation:
//   care_pathway       -> provider workflow (never direct)
//   approval_required  -> classification pending (activation request)
//   request_access     -> the general lane; direct-eligible only when priced
// A missing price is price-on-request, never zero. A variant without a
// commerce binding has no Product Control identity and is projected as
// price-pending request-only, because an estimate without identity would be
// an invented number.

import type {
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderCatalogQuery,
} from "../../../shared/research/assisted-order/contract";
import { assistedOrderActionGroupFor } from "../../../shared/research/assisted-order/contract";
import {
  projectAssistedOrderCatalogItem,
  type AssistedOrderCatalogAuthority,
} from "../../../shared/research/assisted-order/action-policy";
import { EARLY_ACCESS_POLICY_MAX_QUANTITY } from "../../../shared/research/early-access-quantity";
import type { AssistedOrderViewer } from "./ports";
import type { NormalizedMasterOffering } from "../master-offerings/model";
import type { MasterOfferingPriceView } from "../../../shared/research/master-offerings/pricing-contract";
import {
  MASTER_OFFERING_FAMILIES,
  isMasterOfferingFamily,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
} from "../../../shared/research/master-offerings/contract";
import {
  directPurchaseRefusal,
  requiresProviderPathway,
} from "../../../shared/research/master-offerings/pathway-authority";

/**
 * The catalog reader this adapter needs, stated structurally so the
 * master-offerings service type stays behind its own boundary (only the
 * composition root may import it). The composition root passes the real
 * service, which satisfies this shape.
 */
export type AssistedOrderMasterCatalogService = Readonly<{
  select(query: {
    q?: string;
    families?: readonly MasterOfferingFamily[];
    page?: number;
    pageSize?: number;
  }): Promise<{
    offerings: readonly NormalizedMasterOffering[];
    prices: ReadonlyMap<string, MasterOfferingPriceView>;
    page: Readonly<{ total: number; page: number; pageSize: number }>;
  }>;
}>;

export type AssistedOrderCommerceIdentity = Readonly<{
  productId: string;
  variantId: string;
}>;

export type AssistedOrderMasterCatalogInput = Readonly<{
  /** The per-viewer canonical service, or null when the viewer has none. */
  serviceFor(viewer: AssistedOrderViewer): AssistedOrderMasterCatalogService | null;
  /** offering variant id -> Product Control identity, from the reviewed artifact. */
  bindingFor(offeringVariantId: string): AssistedOrderCommerceIdentity | null;
  /** Product Control identity -> offering variant id (the reverse of the artifact). */
  offeringVariantFor(identity: AssistedOrderCommerceIdentity): string | null;
  /** A stable dataset identity that changes when the catalog dataset changes. */
  catalogVersion: string;
  /** Canonical, founder-reviewed formulation holds from the reconciliation record. */
  reviewedFormulationHolds?: ReadonlySet<string>;
}>;

/**
 * The page size the submission-time re-read walks with.
 *
 * Deliberately equal to the catalog search's own maximum. Asking for more does
 * not raise the ceiling, it just hands back a clamped page that looks like the
 * whole dataset.
 */
const RESOLVE_PAGE_SIZE = 100;

/**
 * A hard stop on the walk, so a service that misreports its total can cost a
 * bounded number of reads rather than looping forever inside a submission.
 * Sized far above the real catalog (420 offerings, five pages).
 */
const RESOLVE_MAX_PAGES = 500;

/**
 * Action is a derived, variant-level fact: it depends on canonical pathway,
 * Product Control identity, and the current price projection. The upstream
 * catalog can filter structured family values before paging, but it cannot
 * honestly filter this downstream fact. When an Action filter is present we
 * therefore walk bounded canonical pages, project each variant through the
 * same action policy the cards use, and only then paginate the matches.
 */
const ACTION_FILTER_SCAN_PAGE_SIZE = 100;
const ACTION_FILTER_SCAN_MAX_PAGES = 500;

/** Canonical states whose existing master-offerings action is non-ordering. */
const HELD_DISPLAY_STATES: ReadonlySet<MasterOfferingDisplayState> =
  new Set<MasterOfferingDisplayState>([
    "available_this_week",
    "temporarily_unavailable",
    "coming_soon",
    "planned",
    "unavailable",
  ]);

const OUT_OF_STOCK_DISPLAY_STATES: ReadonlySet<MasterOfferingDisplayState> =
  new Set<MasterOfferingDisplayState>([
    "temporarily_unavailable",
    "unavailable",
  ]);

/**
 * The marker on a synthetic identity for a variant with no commerce binding.
 *
 * A row without a binding still appears in the catalog — that is deliberate,
 * because "Price on request" is a truthful state the founder asked for — so it
 * is minted an identity derived from the offering instead of a Product Control
 * one. The submission path must be able to READ that identity back, or the row
 * becomes something the catalog invites you to ask about and then refuses,
 * taking the entire basket with it. Minting and reading share this constant so
 * the two halves cannot drift.
 */
const UNBOUND_IDENTITY_PREFIX = "unbound:";

/**
 * Exported for the launch-matrix generator (scripts/research-launch), which
 * must resolve every variant through THIS derivation rather than a replica
 * that could drift. Production callers stay inside this module.
 */
export function authorityFor(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOffering["variants"][number],
  price: MasterOfferingPriceView | undefined,
  identity: AssistedOrderCommerceIdentity | null,
  catalogVersion: string,
  reviewedFormulationHolds?: ReadonlySet<string>,
): AssistedOrderCatalogAuthority {
  const priced = price !== undefined && price.state === "priced";
  const pathwaySubject = {
    family: offering.family,
    displayState: offering.displayState,
    variantDisplayState: variant.displayState,
    specification: variant.label,
    reviewedHolds: reviewedFormulationHolds,
  } as const;
  const refusal = directPurchaseRefusal(pathwaySubject);
  const providerWorkflowRequired = requiresProviderPathway(pathwaySubject);
  const classificationPending = variant.displayState === "approval_required"
    || offering.displayState === "approval_required";
  const held = HELD_DISPLAY_STATES.has(variant.displayState)
    || HELD_DISPLAY_STATES.has(offering.displayState)
    || refusal === "formulation_hold"
    // Shipping and fulfillment are catalog facts, not merchandise and not a
    // Care referral. Keep them visible for reconciliation while withholding
    // every ordering action through the existing unavailable presentation.
    || refusal === "non_merchandise_family";
  const outOfStock = OUT_OF_STOCK_DISPLAY_STATES.has(variant.displayState)
    || OUT_OF_STOCK_DISPLAY_STATES.has(offering.displayState);
  const researchUseOnly = offering.family === "research_peptides_materials"
    || offering.family === "research_capsules"
    || offering.family === "research_supplies";
  return Object.freeze({
    // A variant without a commerce binding keeps a synthetic identity so the
    // row stays visible, but it is never direct-eligible and carries no
    // price: identity is what makes an estimate honest.
    productId: identity?.productId ?? `${UNBOUND_IDENTITY_PREFIX}${offering.id}`,
    variantId: identity?.variantId ?? `${UNBOUND_IDENTITY_PREFIX}${variant.id}`,
    productName: offering.displayName,
    family: offering.family,
    channel: offering.category,
    specification: variant.label || null,
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    // The founder's default per-variant ceiling, carried on the authority row
    // itself. It was null before, which read as "no maximum" and left the
    // assisted-order lane bounded only by the contract's 100_000 sanity check,
    // so a request for ten thousand vials of one variant was a legal request.
    // Because M71 stores this band ON each line and checks the quantity against
    // that stored band, the ceiling becomes durable the moment a request is
    // written: no migration, and every already-stored line keeps the band it
    // was accepted under.
    maximumQuantity: EARLY_ACCESS_POLICY_MAX_QUANTITY,
    quantityIncrement: 1,
    unitPriceCents: priced && identity !== null ? price.amountCents : null,
    currency: "USD",
    catalogVersion,
    priceVersion: priced && identity !== null ? price.priceId : null,
    visible: true,
    // Every direct-order refusal comes from the shared canonical pathway
    // authority. Keeping a second family allow-list here made this projection
    // disagree with the member catalog for otherwise eligible supplements,
    // topicals, and research supplies.
    directEligible: priced && identity !== null
      && refusal === null && !held,
    providerWorkflowRequired,
    classificationPending,
    // Pathway precedence: a provider or classification-pending row is not
    // "price pending", its pathway is what blocks it. Price-pending is the
    // truthful state only for the general lane.
    pricePending: (!priced || identity === null)
      && !providerWorkflowRequired && !classificationPending && !held,
    held,
    outOfStock,
    researchUseOnly,
    accessNotice: offering.stateExplanation || null,
  });
}

export function createAssistedOrderMasterCatalogCallbacks(
  input: AssistedOrderMasterCatalogInput,
): Readonly<{
  list(
    viewer: AssistedOrderViewer,
    query: AssistedOrderCatalogQuery,
  ): Promise<AssistedOrderCatalogPage>;
  resolve(
    viewer: AssistedOrderViewer,
    productId: string,
    variantId: string,
  ): Promise<AssistedOrderCatalogItem | null>;
  fingerprint(item: AssistedOrderCatalogItem): string;
}> {
  return Object.freeze({
    async list(viewer, query) {
      const service = input.serviceFor(viewer);
      if (!service) {
        throw new Error("The catalog is not available for this viewer.");
      }
      const family = query.family === undefined
        ? undefined
        : isMasterOfferingFamily(query.family)
          ? query.family
          : null;
      const requestedPage = query.page ?? 1;
      const requestedPageSize = query.pageSize ?? 24;

      // A non-canonical family token must match nothing. Silently dropping it
      // would turn an invalid filter into an unfiltered catalog response.
      if (family === null) {
        return Object.freeze({
          items: Object.freeze([]),
          total: 0,
          page: requestedPage,
          pageSize: requestedPageSize,
          families: MASTER_OFFERING_FAMILIES,
          channels: Object.freeze([]),
          workflowModes: Object.freeze([]),
        });
      }

      const canonicalQuery = {
        q: query.search || undefined,
        families: family === undefined ? undefined : [family],
      } as const;
      const projectSelection = (
        selection: Awaited<ReturnType<AssistedOrderMasterCatalogService["select"]>>,
      ): AssistedOrderCatalogItem[] => {
        const projected: AssistedOrderCatalogItem[] = [];
        for (const offering of selection.offerings) {
          // This adapter's total/page contract is offering-based. The current
          // canonical catalog is intentionally one variant per offering; fail
          // closed if that topology changes so a multi-variant row cannot
          // silently overflow pageSize or corrupt totals. Supporting that
          // future shape requires variant-level pagination at the authority.
          if (offering.variants.length !== 1) {
            throw new Error("Assisted-order catalog requires one variant per offering.");
          }
          for (const variant of offering.variants) {
            const identity = input.bindingFor(variant.id);
            const item = projectAssistedOrderCatalogItem(
              authorityFor(
                offering,
                variant,
                selection.prices.get(variant.id),
                identity,
                input.catalogVersion,
                input.reviewedFormulationHolds,
              ),
            );
            if (item) projected.push(item);
          }
        }
        return projected;
      };

      let items: AssistedOrderCatalogItem[];
      let total: number;

      if (
        query.actionGroup === undefined
        && query.workflowMode === undefined
        && query.channel === undefined
      ) {
        const selection = await service.select({
          ...canonicalQuery,
          page: requestedPage,
          pageSize: requestedPageSize,
        });
        items = projectSelection(selection);
        total = selection.page.total;
      } else {
        const matches: AssistedOrderCatalogItem[] = [];
        let scanPage = 1;
        let sourceTotal: number | null = null;
        for (;;) {
          const selection = await service.select({
            ...canonicalQuery,
            page: scanPage,
            pageSize: ACTION_FILTER_SCAN_PAGE_SIZE,
          });
          for (const item of projectSelection(selection)) {
            if (query.channel !== undefined && item.channel !== query.channel) {
              continue;
            }
            // The customer group is authoritative when present. Exact mode is
            // retained only for older callers; intersecting both would let a
            // stale hidden parameter turn a valid customer filter into zero.
            const matchesAction = query.actionGroup !== undefined
              ? assistedOrderActionGroupFor(item.workflowMode) === query.actionGroup
              : query.workflowMode !== undefined
                ? item.workflowMode === query.workflowMode
                : true;
            if (matchesAction) matches.push(item);
          }
          if (sourceTotal === null) sourceTotal = selection.page.total;
          if (selection.offerings.length === 0) break;
          const sourcePageSize = selection.page.pageSize > 0
            ? selection.page.pageSize
            : ACTION_FILTER_SCAN_PAGE_SIZE;
          if (scanPage * sourcePageSize >= sourceTotal) break;
          scanPage += 1;
          if (scanPage > ACTION_FILTER_SCAN_MAX_PAGES) break;
        }
        total = matches.length;
        const start = (requestedPage - 1) * requestedPageSize;
        items = start >= total
          ? []
          : matches.slice(start, start + requestedPageSize);
      }

      return Object.freeze({
        items: Object.freeze(items),
        total,
        page: requestedPage,
        pageSize: requestedPageSize,
        // Stable canonical values keep the select usable after one family is
        // chosen; deriving options from the filtered page would erase every
        // alternative family as soon as the first filter was applied.
        families: MASTER_OFFERING_FAMILIES,
        channels: Object.freeze(
          Array.from(new Set(items.map((item) => item.channel))),
        ),
        workflowModes: Object.freeze(
          Array.from(new Set(items.map((item) => item.workflowMode))),
        ),
      });
    },

    // Submission-time re-read: the exact product and variant again from the
    // canonical authority, never the browser snapshot. An unknown identity
    // resolves to null and the line is refused upstream.
    async resolve(viewer, productId, variantId) {
      const service = input.serviceFor(viewer);
      if (!service) return null;
      // A synthetic identity carries the offering variant id in plain sight, so
      // read it back rather than asking the binding map, which by definition has
      // no entry for an unbound row.
      const syntheticIdentity = variantId.startsWith(UNBOUND_IDENTITY_PREFIX);
      const offeringVariantId = syntheticIdentity
        ? variantId.slice(UNBOUND_IDENTITY_PREFIX.length)
        : input.offeringVariantFor({ productId, variantId });
      if (!offeringVariantId) return null;
      // A synthetic id is valid only while the canonical variant remains
      // unbound. Once Product Control has a reviewed binding, the old browser
      // snapshot is stale and must be refreshed instead of being upgraded into
      // the newly priced/direct identity during submit.
      if (syntheticIdentity && input.bindingFor(offeringVariantId) !== null) {
        return null;
      }
      // PAGE THROUGH. Asking for one enormous page does not work: the catalog
      // search hard-clamps pageSize to its own maximum and then slices, so a
      // request for a million rows silently returns the alphabetically first
      // hundred. This seam used to do exactly that, and the 320 offerings past
      // that boundary — including most of the priced, directly orderable ones —
      // resolved to null at submission. The line then threw a bare Error, which
      // is not one of the typed refusals, so the customer's whole request died
      // as "The assisted order service is temporarily unavailable" AFTER they
      // had filled in contact details and accepted every agreement, with
      // nothing stored and no operator notified.
      //
      // It hid because both halves are correct on their own: the clamp is
      // pinned by its own test, and this seam's test double ignores paging and
      // returns everything it was given. Only the composition was wrong. It
      // also hid at runtime because a miss returns null, which is equally the
      // honest answer for an identity that genuinely is not in the catalog.
      //
      // The loop is bounded by the reported total and by a page-count ceiling,
      // so a service that keeps reporting a larger total can never spin here.
      let page = 1;
      let total: number | null = null;
      for (;;) {
        const selection = await service.select({ page, pageSize: RESOLVE_PAGE_SIZE });
        for (const offering of selection.offerings) {
          for (const variant of offering.variants) {
            if (variant.id !== offeringVariantId) continue;
            // Both halves of a synthetic identity are minted together. Trusting
            // only the variant half lets a caller pair one real unbound variant
            // with arbitrary product ids, bypassing duplicate-line identity
            // checks and swapping the product identity stored on the request.
            if (
              syntheticIdentity &&
              productId !== `${UNBOUND_IDENTITY_PREFIX}${offering.id}`
            ) {
              return null;
            }
            return projectAssistedOrderCatalogItem(
              authorityFor(
                offering,
                variant,
                selection.prices.get(variant.id),
                // Synthetic rows are intentionally request-only and unpriced.
                // Passing their synthetic ids as a commerce identity would
                // manufacture direct-order authority at submission time.
                syntheticIdentity ? null : { productId, variantId },
                input.catalogVersion,
                input.reviewedFormulationHolds,
              ),
            );
          }
        }
        if (total === null) total = selection.page.total;
        // A page the service could not fill is the end of the dataset, whatever
        // the reported total claims.
        if (selection.offerings.length === 0) return null;
        const pageSize = selection.page.pageSize > 0
          ? selection.page.pageSize
          : RESOLVE_PAGE_SIZE;
        if (page * pageSize >= total) return null;
        page += 1;
        if (page > RESOLVE_MAX_PAGES) return null;
      }
    },

    fingerprint(item) {
      return JSON.stringify([
        item.productId,
        item.variantId,
        item.unitPriceCents,
        item.priceVersion,
        item.catalogVersion,
        item.workflowMode,
      ]);
    },
  });
}
