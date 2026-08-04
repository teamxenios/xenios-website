import type { EarlyAccessCatalogProjection } from "../catalog/early-access-catalog";
import { earlyAccessRowKey } from "../catalog/early-access-catalog";
import type { EarlyAccessSessionCheck } from "../private-access-routes";
import {
  earlyAccessReleaseVersion,
  isNonwaivableBlocker,
  type EarlyAccessRelease,
  type EarlyAccessReleaseLedger,
} from "./founder-release";
import { buildEarlyAccessStorefront } from "./storefront-view";

// The two routes the bridge needs: what a signed-in customer may see, and how a
// founder records a release.
//
// They are deliberately separate handlers with separate guards. The customer
// route is protected by the Early Access session and must never accept an admin
// credential as a substitute; the founder route is protected by the admin guard
// at the mount point, following the pattern the rest of this server already
// uses, and must never be reachable with only a customer session.

export interface EarlyAccessCatalogSource {
  load(now: Date): Promise<EarlyAccessCatalogProjection>;
}

/** Used until the Product Control adapter is wired, and by tests. */
export class EmptyEarlyAccessCatalogSource implements EarlyAccessCatalogSource {
  async load(now: Date): Promise<EarlyAccessCatalogProjection> {
    return {
      evaluatedAt: now.toISOString(),
      rows: [],
      productsWithoutVariants: [],
    } as unknown as EarlyAccessCatalogProjection;
  }
}

export interface EarlyAccessReleaseRouteDependencies {
  readonly resolveSession: (cookieHeader: unknown) => Promise<EarlyAccessSessionCheck>;
  readonly catalog: EarlyAccessCatalogSource;
  readonly ledger: EarlyAccessReleaseLedger;
  readonly now: () => number;
  readonly logger?: (event: string, detail?: Record<string, unknown>) => void;
}

type ResponsePort = {
  setHeader(name: string, value: string): void;
  status(code: number): ResponsePort;
  json(body: unknown): unknown;
};

function applyPrivateHeaders(response: ResponsePort): void {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
}

function send(response: ResponsePort, status: number, body: unknown): void {
  response.status(status).json(body);
}

// ---------------------------------------------------------------------------
// Customer: the catalog behind the gate
// ---------------------------------------------------------------------------

export function createEarlyAccessCatalogRoute(deps: EarlyAccessReleaseRouteDependencies) {
  return async (request: { cookieHeader?: unknown }, response: ResponsePort): Promise<void> => {
    try {
      applyPrivateHeaders(response);

      const check = await deps.resolveSession(request?.cookieHeader);
      if (!check.authenticated) {
        // A protected resource refuses rather than returning an empty catalog.
        // An empty list and a rejected session must not look the same, or a
        // signed-out customer sees "nothing available" and believes it.
        send(response, 401, { ok: false, code: "not_authenticated" });
        return;
      }

      const now = deps.now();
      if (!Number.isSafeInteger(now) || now <= 0) {
        send(response, 503, { ok: false, code: "unavailable" });
        return;
      }

      const projection = await deps.catalog.load(new Date(now));
      const releases = await deps.ledger.all();
      const storefront = buildEarlyAccessStorefront({ projection, releases });

      send(response, 200, {
        ok: true,
        evaluatedAt: storefront.evaluatedAt,
        purchasableCount: storefront.purchasableCount,
        heldCount: storefront.heldCount,
        units: storefront.units,
      });
    } catch {
      // A catalog that cannot be built must not read as a catalog with nothing
      // in it, for the same reason as above.
      try {
        send(response, 503, { ok: false, code: "unavailable" });
      } catch {
        // The response port itself is broken; there is nothing further to do.
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Founder: recording a release
// ---------------------------------------------------------------------------

export type FounderReleaseRequest = {
  readonly body?: unknown;
  /** Resolved by the admin guard at the mount point, never from the body. */
  readonly actor?: unknown;
};

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] | null {
  const value = source[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === "string") ? [...(value as string[])] : null;
}

/**
 * Record a founder release.
 *
 * The ACTOR never comes from the request body. It is whoever the admin guard
 * authenticated, because an audit trail that records a name the caller typed is
 * not an audit trail.
 *
 * The founder must ECHO the product version they were shown. The server
 * recomputes it and refuses a mismatch, so a product that changed between the
 * founder reading the screen and pressing approve cannot be approved unseen.
 */
export function createFounderReleaseRoute(deps: EarlyAccessReleaseRouteDependencies) {
  return async (request: FounderReleaseRequest, response: ResponsePort): Promise<void> => {
    try {
      applyPrivateHeaders(response);

      const actor = typeof request?.actor === "string" ? request.actor : null;
      if (actor === null || actor.length === 0) {
        send(response, 403, { ok: false, code: "actor_unknown" });
        return;
      }

      const body = request?.body;
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        send(response, 400, { ok: false, code: "body_invalid" });
        return;
      }
      const input = body as Record<string, unknown>;

      const productId = readString(input, "productId");
      const variantId = readString(input, "variantId");
      const releaseId = readString(input, "releaseId");
      const expectedVersion = readString(input, "productVersion");
      const reason = readString(input, "reason");
      const status = readString(input, "status") ?? "approved";
      const waivedBlockers = readStringArray(input, "waivedBlockers");
      if (
        productId === null ||
        variantId === null ||
        releaseId === null ||
        expectedVersion === null ||
        reason === null ||
        waivedBlockers === null
      ) {
        send(response, 400, { ok: false, code: "body_invalid" });
        return;
      }

      const now = deps.now();
      const projection = await deps.catalog.load(new Date(now));
      const row = projection.rows.find(
        (candidate) => earlyAccessRowKey(candidate) === `${productId}::${variantId}`,
      );
      if (row === undefined) {
        send(response, 404, { ok: false, code: "unit_not_found" });
        return;
      }

      // Refused at the route as well as in the domain function. A founder should
      // be told which blocker stopped them, not handed a generic rejection, and
      // the check must not depend on one layer being reached.
      const nonwaivableOnUnit = row.blockers.filter((blocker) => isNonwaivableBlocker(blocker));
      if (nonwaivableOnUnit.length > 0) {
        send(response, 422, {
          ok: false,
          code: "NONWAIVABLE_BLOCKER",
          nonwaivableBlockers: nonwaivableOnUnit,
        });
        return;
      }
      const attemptedNonwaivable = waivedBlockers.filter((blocker) => isNonwaivableBlocker(blocker));
      if (attemptedNonwaivable.length > 0) {
        send(response, 422, {
          ok: false,
          code: "NONWAIVABLE_BLOCKER",
          nonwaivableBlockers: attemptedNonwaivable,
        });
        return;
      }

      const currentVersion = earlyAccessReleaseVersion(row);
      if (currentVersion !== expectedVersion) {
        // Optimistic locking. The founder approved a picture that has since
        // changed, so they are sent back to look at the new one.
        send(response, 409, {
          ok: false,
          code: "product_changed",
          currentVersion,
          blockers: row.blockers,
        });
        return;
      }

      const appended = await deps.ledger.append({
        releaseId,
        productId,
        variantId,
        productVersion: currentVersion,
        status,
        approvedPriceCents: input.approvedPriceCents,
        currency: input.currency,
        waivedBlockers,
        approvedQuantityLimit: input.approvedQuantityLimit,
        expiresAt: input.expiresAt === undefined ? null : input.expiresAt,
        actor,
        reason,
        recordedAt: new Date(now).toISOString(),
      });
      if (!appended.ok) {
        // Operator-facing, so the exact field at fault is named.
        send(response, 400, { ok: false, code: appended.code });
        return;
      }

      deps.logger?.("early_access.release.recorded", {
        releaseId,
        productId,
        variantId,
        status,
      });
      send(response, 201, { ok: true, release: appended.release });
    } catch {
      try {
        send(response, 503, { ok: false, code: "unavailable" });
      } catch {
        // The response port itself is broken.
      }
    }
  };
}

/** The append-only history for one unit, for the founder admin screen. */
export function createReleaseHistoryRoute(deps: EarlyAccessReleaseRouteDependencies) {
  return async (
    request: { query?: Record<string, unknown> },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const query = request?.query ?? {};
      const productId = typeof query.productId === "string" ? query.productId : null;
      const variantId = typeof query.variantId === "string" ? query.variantId : null;
      if (productId === null || variantId === null) {
        send(response, 400, { ok: false, code: "query_invalid" });
        return;
      }
      const history: readonly EarlyAccessRelease[] = await deps.ledger.history(productId, variantId);
      send(response, 200, { ok: true, history });
    } catch {
      try {
        send(response, 503, { ok: false, code: "unavailable" });
      } catch {
        // The response port itself is broken.
      }
    }
  };
}
