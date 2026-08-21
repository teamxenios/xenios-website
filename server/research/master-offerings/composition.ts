/**
 * The wiring the composition root would otherwise have to write by hand.
 *
 * Everything this lane needs assembled in one place, typechecked, so the
 * integration owner calls one function instead of reproducing forty lines from
 * a document. Prose drifts from signatures silently; this does not compile when
 * it drifts.
 *
 * It registers no route and imports no composition root. Mounting stays exactly
 * where it belongs, with the one owner of `server/index.ts`.
 *
 * The one property worth reading the code for: `serviceForViewer` builds a NEW
 * service per request. The price authority memoizes per variant for the life of
 * one instance, which is what makes a page of twenty-four cards affordable, and
 * which would serve yesterday's prices if the instance outlived the request.
 *
 * Two more per-request memos hang off that same lifetime, for the same reason.
 * The Product Control catalog behind approved pricing is read once per request
 * rather than once per variant, and the read-only binding join answers each
 * variant once rather than once per authority that asks. Both are built here,
 * inside `serviceForViewer`, so neither can outlive the request and quote a
 * price or a binding that has since changed. See
 * `docs/research/CATALOG_PRICING_PERFORMANCE.md`.
 */

import type { CartPurchaseAudience } from "@shared/research/cart-product-selection";
import type { CustomerPriceAudience } from "@shared/research/pricing";
import { reviewedHeldSpecifications } from "./reviewed-holds";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
} from "../pricing/authoritative-price-resolver";
import { createRequestScopedPricingProductSource } from "../pricing/request-scoped-product-source";
import type { VisibilityEnv } from "../catalog-display/visibility";
import {
  createMasterOfferingCatalogReaderFromEnv,
  MasterOfferingDatasetUnavailable,
  type DatasetFileSystem,
} from "./dataset-reader";
import type { DatasetLocationProbe } from "./dataset-location";
import {
  createAuthoritativeApprovedPriceReader,
  createMasterOfferingPriceAuthority,
} from "./price-authority";
import { createRequestScopedBindingReader } from "./request-scoped-bindings";
import {
  createMasterOfferingProductControlResolver,
  type MasterOfferingCommerceBindingReader,
  type ProductControlSelectionAuthority,
} from "./product-control-adapter";
import type { MasterOfferingCatalogApiDependencies, MasterOfferingCatalogViewer } from "./routes";
import {
  MasterOfferingCatalogService,
  type MasterOfferingCatalogReader,
} from "./service";
import { masterOfferingsManualPurchaseRequests } from "./visibility-policy";

/**
 * The per-request facts only the authenticated session can supply.
 *
 * The browser never chooses any of these. `audience` must come from the
 * server-side member tier or account role, never from a body, query, header, or
 * cookie value.
 */
export interface MasterOfferingRequestIdentity {
  audience: CartPurchaseAudience & CustomerPriceAudience;
  /** The version of the authorization decision, for auditability. */
  sourceVersion: string;
  /** One instant for the whole request, so price and selection agree. */
  evaluatedAt: string;
  currency: string;
}

export interface MasterOfferingCompositionInput {
  /** Read-only exact-variant join. It has no mutation method by design. */
  bindings: MasterOfferingCommerceBindingReader;
  /** The existing Product Control selector. This lane does not reimplement it. */
  selections: ProductControlSelectionAuthority;
  /** The existing catalog reader behind approved pricing. */
  pricingSource: PricingProductSource;
  /** Resolved from the authenticated session, per request. */
  identityFor(
    viewer: MasterOfferingCatalogViewer,
  ): Promise<MasterOfferingRequestIdentity | null> | MasterOfferingRequestIdentity | null;
  /** Supplied only by tests; production reads the dataset path from env. */
  catalogReader?: MasterOfferingCatalogReader;
  env?: VisibilityEnv;
  files?: DatasetFileSystem;
  /**
   * How the committed-artifact lookup decides a path exists, and from where.
   * Supplied only by tests: a test that must prove "no dataset anywhere" cannot
   * do it against the real filesystem, because the repository now ships a
   * committed artifact and the real answer there is that one exists.
   */
  datasetProbe?: DatasetLocationProbe;
  cwd?: string;
  now?(): string;
}

export class MasterOfferingCatalogNotConfigured extends Error {
  constructor(reason: string) {
    super(`master offerings catalog not configured: ${reason}`);
    this.name = "MasterOfferingCatalogNotConfigured";
  }
}

/**
 * Build the dependencies for `createMasterOfferingCatalogApiHandlers`.
 *
 * `authorizeViewer` stays with the caller: only the composition root knows how
 * this deployment authenticates, and inventing an answer here would be a second
 * authentication system.
 */
export function createMasterOfferingCatalogDependencies(
  input: MasterOfferingCompositionInput,
  authorizeViewer: MasterOfferingCatalogApiDependencies["authorizeViewer"],
): MasterOfferingCatalogApiDependencies {
  const env = input.env ?? process.env;
  const reader =
    input.catalogReader ??
    createMasterOfferingCatalogReaderFromEnv(
      env as NodeJS.ProcessEnv,
      input.files,
      input.datasetProbe,
      input.cwd,
    );

  const capabilities = {
    manualEarlyAccessPurchase: masterOfferingsManualPurchaseRequests(env),
    // The founder's reviewed commerce holds, read once here rather than left
    // for a caller to remember. A hold that has to be opted into is a hold
    // nobody has: the resolver's default capabilities carry none, so without
    // this line every held product is purchasable and every unit test still
    // passes. Read at composition so an unreadable record fails the service
    // rather than silently selling.
    reviewedFormulationHolds: reviewedHeldSpecifications(input.cwd),
  };

  return {
    authorizeViewer,
    env,
    now: input.now,
    serviceForViewer(viewer) {
      if (reader === null) {
        // No dataset configured. Throwing here reaches the route's catch and
        // becomes an honest 503, never an empty catalog.
        throw new MasterOfferingDatasetUnavailable("no dataset path configured");
      }

      // Resolved once per request and shared by both authorities, so a price
      // and a purchase verdict can never describe two different instants.
      let identity: MasterOfferingRequestIdentity | null | undefined;
      const resolveIdentity = async () => {
        if (identity === undefined) identity = await input.identityFor(viewer);
        return identity;
      };

      // One binding answer per variant for the whole request, shared by the
      // price authority and the purchase resolver below.
      const bindings = createRequestScopedBindingReader(input.bindings);

      const commerce = createMasterOfferingProductControlResolver({
        bindings,
        selections: input.selections,
        context: async () => {
          const resolved = await resolveIdentity();
          return resolved === null
            ? null
            : {
                audience: resolved.audience,
                currency: resolved.currency,
                evaluatedAt: resolved.evaluatedAt,
                // The provenance of the authorization decision, so a real
                // selection authority receives a complete audience fact
                // instead of having to invent one it never read.
                audienceSourceVersion: resolved.sourceVersion,
              };
        },
      });

      const prices = createMasterOfferingPriceAuthority({
        bindings,
        prices: createAuthoritativeApprovedPriceReader(
          // One Product Control read for the request, not one per variant.
          createAuthoritativePriceResolver(
            createRequestScopedPricingProductSource(input.pricingSource),
          ),
          async () => {
            const resolved = await resolveIdentity();
            if (resolved === null) return null;
            const authenticatedAudience = authorizeAudienceFromServerIdentity({
              audience: resolved.audience,
              sourceVersion: resolved.sourceVersion,
              evaluatedAt: resolved.evaluatedAt,
            });
            // A malformed authorization shows no price. It does not fall back
            // to an unauthenticated one, because there is no such thing.
            return authenticatedAudience === null
              ? null
              : { authenticatedAudience, currency: resolved.currency };
          },
        ),
      });

      // New per request. See the note at the top of this file.
      return new MasterOfferingCatalogService(
        reader,
        commerce,
        prices,
        capabilities,
      );
    },
  };
}
