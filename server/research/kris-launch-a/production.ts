import type { Request } from "express";
import type { KrisPriceProfile } from "@shared/research/kris-launch-a/contract";
import type { MemberRow } from "../member-auth";
import {
  KrisDatasetUnavailable,
  createKrisCatalogSourceFromEnv,
  type KrisCatalogSource,
} from "./dataset-reader";
import type { KrisCatalogApiDependencies, KrisCatalogViewer } from "./routes";
import { KrisCatalogService } from "./service";
import type { KrisLegacyOrderResolver } from "./projection";
import type { BuyerScopedPricing } from "../early-access/commerce/buyer-scoped-pricing";
import {
  buildKrisLegacyOrderResolver,
  loadKrisLegacyBindings,
  type KrisDoorCatalogSource,
  type KrisDoorReleaseLedger,
  type KrisMemberCustomerDirectory,
} from "./legacy-order-production";

export type ResolveKrisActiveMember = (
  req: Request,
) => Promise<MemberRow | null> | MemberRow | null;

/**
 * Production dependencies for the private Launch A catalog.
 *
 * The canonical member guard stays in the composition root and is injected as
 * one resolver. The generated artifact is resolved once so its indexed reader
 * and mtime cache are shared across requests; a service is still created per
 * entitled request, with the profile the server resolved rather than a value
 * supplied by the browser.
 */
export function buildKrisCatalogProductionDependencies(
  resolveActiveMember: ResolveKrisActiveMember,
  options: {
    env?: NodeJS.ProcessEnv;
    source?: KrisCatalogSource | null;
    /** Exact Product Control selections only. Omitted means every Buy Now fails closed. */
    resolveLegacyOrder?: KrisLegacyOrderResolver;
    /**
     * The order door's own sources, when this deployment can offer Buy Now.
     * Reviewed bindings resolve against these per request; omitted (or any
     * disagreement downstream) means every Buy Now fails closed, while the
     * catalog itself still serves.
     */
    legacyOrders?: {
      catalog: KrisDoorCatalogSource;
      releases: KrisDoorReleaseLedger;
      customers: KrisMemberCustomerDirectory;
      /**
       * The buyer-scoped pricing seam the order door consults, so the shelf
       * offers exactly what the door will authorize. Absent means ledger
       * prices, which safeLegacyOrder then compares as before.
       */
      buyerScopedPrices?: BuyerScopedPricing;
    };
  } = {},
): KrisCatalogApiDependencies {
  if (typeof resolveActiveMember !== "function") {
    throw new Error("Kris Launch A production composition requires canonical member auth");
  }

  const env = options.env ?? process.env;
  const source =
    options.source === undefined
      ? createKrisCatalogSourceFromEnv(env)
      : options.source;
  // Loaded once at composition; per-request work stays reads-only.
  const bindings =
    options.legacyOrders === undefined ? [] : loadKrisLegacyBindings(env);

  return {
    env,
    authorizeViewer: async (req) => {
      const member = await resolveActiveMember(req);
      if (!member) return null;
      const email = typeof member.email === "string" ? member.email.trim() : "";
      const memberId = typeof member.id === "string" ? member.id.trim() : "";
      if (email === "" || memberId === "") return null;
      return { audience: "member", email, memberId };
    },
    serviceForProfile: (profile: KrisPriceProfile, viewer: KrisCatalogViewer) => {
      // Synchronous on purpose: an unreadable artifact must throw NOW, so the
      // caller's 503 never depends on how far an async build got.
      if (source === null) {
        throw new KrisDatasetUnavailable("Launch A catalog artifact is unavailable");
      }
      const legacyOrders = options.legacyOrders;
      if (options.resolveLegacyOrder !== undefined || legacyOrders === undefined) {
        return new KrisCatalogService(source, profile, options.resolveLegacyOrder);
      }
      return buildKrisLegacyOrderResolver({ ...legacyOrders, bindings }, viewer).then(
        (resolveLegacyOrder) => new KrisCatalogService(source, profile, resolveLegacyOrder),
      );
    },
  };
}
