/**
 * The pricing HTTP registration adapter. Server only, read only.
 *
 * This module wraps the frozen pricing core (authoritative-price-resolver and
 * catalog-price-projection) in the smallest possible Express surface so the
 * release manager's wiring is exactly one import plus one call in
 * server/index.ts. It registers nothing by itself and takes every collaborator
 * by injection, so it is testable with no database, no network, and no
 * credential.
 *
 * Boundary rules enforced here:
 * - The browser never chooses the audience. The adapter never reads an
 *   audience from a query parameter, body, header, or cookie. The injected
 *   authorizer derives the audience from the authenticated request on the
 *   server side; the adapter then brands it through
 *   authorizeAudienceFromServerIdentity at the exact resolution instant. In
 *   production the authorizer is built on the repo's member-auth pattern
 *   (server/research/member-auth.ts): verify the Supabase JWT, resolve the
 *   member row, map the membership to an audience, and fingerprint the row
 *   facts into sourceVersion, exactly as memberAudience does in
 *   server/research/catalog/member-catalog-service.ts. Tests inject a fake.
 * - Fail closed everywhere. Missing dependencies refuse registration before
 *   any route mounts. The enablement flag defaults to disabled and a disabled
 *   surface answers 503 pricing_disabled uniformly (the same idiom as the
 *   care rail's care_disabled in server/care/access.ts). An unknown or
 *   unauthorized audience answers 401 and the resolver is never called. A
 *   malformed id answers 400 with a closed code and never echoes the input.
 *   An unexpected failure answers 503 pricing_unavailable, never a 500 with
 *   internal detail.
 * - The wire never carries an internal field and never carries a zero price.
 *   Both endpoints serialize through projectCatalogPrice, which rebuilds the
 *   CustomerPrice by explicit field picks and rejects any non positive
 *   amount, so a smuggled field or a zero amount cannot reach a browser.
 * - Currency is USD only and is fixed server side. A currency query
 *   parameter is ignored; the response DTO states its currency explicitly.
 * - Read only. There is no mutation endpoint of any kind here.
 *
 * Closed wire codes: pricing_disabled (503), pricing_auth_required (401),
 * pricing_invalid_request (400), pricing_unavailable (503). Unavailability
 * reasons are the closed PriceResolutionFailureReason enum from
 * shared/research/pricing.ts and nothing else; an off enum reason from a
 * misbehaving resolver collapses to price_missing.
 */

import type { Express, NextFunction, Request, Response } from "express";
import {
  PRICE_RESOLUTION_FAILURE_REASONS,
  type CustomerPriceAudience,
  type PriceResolution,
  type PriceResolutionFailureReason,
} from "@shared/research/pricing";
import {
  authorizeAudienceFromServerIdentity,
  type ResolveApprovedResearchPriceInput,
} from "./authoritative-price-resolver";
import { projectCatalogPrice } from "./catalog-price-projection";

/**
 * The server derived audience facts for one authenticated request. This is
 * deliberately not the branded ServerAuthorizedAudience: the adapter brands
 * the grant itself at the resolution instant, so a stale or forged
 * authorization cannot price a later moment.
 */
export interface PricingAudienceGrant {
  audience: CustomerPriceAudience;
  sourceVersion: string;
}

/**
 * Derives the authenticated audience from the request, server side only.
 * Return null for an unauthenticated or unrecognized caller; the adapter
 * answers 401 and never calls the resolver. Implementations must never read
 * an audience from query, body, header, or cookie input.
 */
export type PricingAudienceAuthorizer = (
  req: Request,
) => Promise<PricingAudienceGrant | null> | PricingAudienceGrant | null;

/** The one read the adapter needs from the frozen resolver. */
export interface PricingResolverPort {
  resolveApprovedResearchPrice(
    input: ResolveApprovedResearchPriceInput,
  ): Promise<PriceResolution>;
}

export interface PricingApiDependencies {
  resolver: PricingResolverPort;
  authorizeAudience: PricingAudienceAuthorizer;
  /**
   * Enablement flag, evaluated per request. Omitted means disabled: every
   * endpoint answers 503 pricing_disabled until the wiring opts in. A flag
   * that throws reads as disabled.
   */
  enabled?: () => boolean;
  /** Clock seam for tests. Defaults to the real clock. */
  now?: () => Date;
}

export const PRICING_PRICE_ROUTE =
  "/api/research/pricing/products/:productId/variants/:variantId/price";
export const PRICING_CARD_PRICE_ROUTE =
  "/api/research/pricing/products/:productId/variants/:variantId/card-price";

export const PRICING_DISABLED_RESPONSE = {
  ok: false,
  code: "pricing_disabled",
  message: "Pricing is not available right now.",
} as const;

export const PRICING_AUTH_REQUIRED_RESPONSE = {
  ok: false,
  code: "pricing_auth_required",
} as const;

export const PRICING_INVALID_REQUEST_RESPONSE = {
  ok: false,
  code: "pricing_invalid_request",
} as const;

export const PRICING_TEMPORARILY_UNAVAILABLE_RESPONSE = {
  ok: false,
  code: "pricing_unavailable",
} as const;

/**
 * The only id shape the adapter forwards: one leading alphanumeric, then up
 * to 127 alphanumerics, underscores, or hyphens. This covers UUIDs and the
 * repo's slug style ids while rejecting whitespace, path tricks, and control
 * characters before any collaborator runs. Stricter than the resolver's own
 * non empty check, which is fine: rejecting more at the edge is fail closed.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * The production enablement flag: pricing rides the same commerce env flag
 * the rest of the research commerce surface uses (see researchCommerceEnabled
 * in server/research/index.ts). Exported so the server/index.ts wiring is one
 * reference, not a re-derivation.
 */
export function pricingEnabledFromCommerceEnv(): boolean {
  return process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
}

/** Prices are audience specific and must never be cached or indexed. */
function privateHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
}

const CLOSED_REASONS = new Set<string>(PRICE_RESOLUTION_FAILURE_REASONS);

/** Collapse anything off the closed enum to price_missing. Fail closed. */
function closedReason(reason: string): PriceResolutionFailureReason {
  return CLOSED_REASONS.has(reason)
    ? (reason as PriceResolutionFailureReason)
    : "price_missing";
}

function respondResolvedPrice(res: Response, resolution: PriceResolution): void {
  // projectCatalogPrice is the single sanitization path: it rebuilds the
  // price by explicit field picks and rejects malformed or non positive
  // amounts, so both endpoints share one customer-safe boundary.
  const projection = projectCatalogPrice(resolution);
  if (projection.state === "priced") {
    res.json({ ok: true, state: "available", price: projection.price });
    return;
  }
  // An "available" resolution the projection refused is malformed output
  // from the resolver; it reads as missing, never as an error or a price.
  const reason =
    resolution.state === "available"
      ? "price_missing"
      : closedReason(resolution.reason);
  res.json({ ok: true, state: "unavailable", reason });
}

function respondCardProjection(res: Response, resolution: PriceResolution): void {
  // The card contract carries no reason at all: a card either shows the
  // price or shows not currently available. That is what makes this endpoint
  // genuinely distinct from the resolved price endpoint above.
  res.json({ ok: true, projection: projectCatalogPrice(resolution) });
}

function requireFunction(value: unknown, what: string): void {
  if (typeof value !== "function") {
    throw new Error(`registerPricingApi refused: ${what} is required`);
  }
}

/**
 * Mounts the read only pricing endpoints. Throws before mounting anything if
 * a dependency is missing or malformed, so the API is never half mounted:
 * either both endpoints exist with a full dependency set, or neither does.
 */
export function registerPricingApi(
  app: Express,
  deps: PricingApiDependencies,
): void {
  if (!app || typeof app.get !== "function") {
    throw new Error("registerPricingApi refused: an express app is required");
  }
  if (!deps || typeof deps !== "object") {
    throw new Error("registerPricingApi refused: dependencies are required");
  }
  if (!deps.resolver || typeof deps.resolver !== "object") {
    throw new Error("registerPricingApi refused: resolver is required");
  }
  requireFunction(
    deps.resolver.resolveApprovedResearchPrice,
    "resolver.resolveApprovedResearchPrice",
  );
  requireFunction(deps.authorizeAudience, "authorizeAudience");
  if (deps.enabled !== undefined) requireFunction(deps.enabled, "enabled");
  if (deps.now !== undefined) requireFunction(deps.now, "now");

  const resolver = deps.resolver;
  const authorizeAudience = deps.authorizeAudience;
  const enabled = deps.enabled ?? (() => false);
  const now = deps.now ?? (() => new Date());

  const handle =
    (respond: (res: Response, resolution: PriceResolution) => void) =>
    async (req: Request, res: Response): Promise<void> => {
      let isEnabled = false;
      try {
        isEnabled = enabled() === true;
      } catch {
        isEnabled = false;
      }
      if (!isEnabled) {
        res.status(503).json(PRICING_DISABLED_RESPONSE);
        return;
      }

      const productId = String(req.params.productId ?? "");
      const variantId = String(req.params.variantId ?? "");
      if (!SAFE_ID_PATTERN.test(productId) || !SAFE_ID_PATTERN.test(variantId)) {
        // Closed code only. The malformed input is never echoed back.
        res.status(400).json(PRICING_INVALID_REQUEST_RESPONSE);
        return;
      }

      try {
        const grant = await authorizeAudience(req);
        if (grant === null) {
          res.status(401).json(PRICING_AUTH_REQUIRED_RESPONSE);
          return;
        }
        const at = now().toISOString();
        // Brand the grant at the resolution instant. An off allowlist
        // audience or an empty sourceVersion fails the brand and reads as
        // unauthorized; the resolver is never called with it.
        const authorized = authorizeAudienceFromServerIdentity({
          audience: grant.audience,
          sourceVersion: grant.sourceVersion,
          evaluatedAt: at,
        });
        if (authorized === null) {
          res.status(401).json(PRICING_AUTH_REQUIRED_RESPONSE);
          return;
        }
        const resolution = await resolver.resolveApprovedResearchPrice({
          productId,
          variantId,
          authenticatedAudience: authorized,
          currency: "USD",
          at,
        });
        respond(res, resolution);
      } catch {
        // Authorizer and resolver failures stay inside this boundary. Never
        // a 500, never an internal message, never a guessed price.
        res.status(503).json(PRICING_TEMPORARILY_UNAVAILABLE_RESPONSE);
      }
    };

  app.get(PRICING_PRICE_ROUTE, privateHeaders, handle(respondResolvedPrice));
  app.get(
    PRICING_CARD_PRICE_ROUTE,
    privateHeaders,
    handle(respondCardProjection),
  );
}
