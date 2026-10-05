import { createHash, createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Request } from "express";
import type { AssistedOrderService } from "../../assisted-order/service";
import type { AssistedOrderViewer } from "../../assisted-order/ports";
import type { createAssistedOrderViewerResolvers } from "../../assisted-order/express";
import { rateLimitHit, requestIp } from "../../rate-limit";
import { quickOrderAgreements } from "./legal";
import type { createQuickOrderCanonicalCatalog } from "./catalog";
import type { QuickOrderAssistedOrderExtension, QuickOrderPorts, QuickOrderSession } from "./ports";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface QuickOrderProductionWiring {
  viewers: Pick<ReturnType<typeof createAssistedOrderViewerResolvers>, "customer">;
  service: Pick<AssistedOrderService, "config">;
  catalog: ReturnType<typeof createQuickOrderCanonicalCatalog>;
  /** Existing server secret, passed only by the approved composition root.
   * It signs a purpose-bound CSRF value; it never authenticates a customer. */
  csrfSecret: string | null;
  /** Empty until exact published terms are approved for this Health intake. */
  approvedHealthAgreementPairs: readonly { kind: string; version: string }[];
  /** Absent until the canonical request transaction/reader extension is approved. */
  assistedOrderExtension: QuickOrderAssistedOrderExtension | null;
}

/** Concrete adapters for the authorities that already exist. Deliberately not
 * mounted and not activatable: no current canonical transaction implements the
 * new evidence + actor-key replay + decisive authority contract. A flag cannot
 * supply that missing implementation or its qualification.
 */
export function createQuickOrderProductionPorts(wiring: QuickOrderProductionWiring): QuickOrderPorts {
  const viewers = new WeakMap<QuickOrderSession, AssistedOrderViewer>();
  const viewerFor = (session: QuickOrderSession): AssistedOrderViewer => {
    const viewer = viewers.get(session);
    if (!viewer) throw new Error("Quick Order session unavailable");
    return viewer;
  };
  return {
    productionReady: false,
    async session(request: IncomingMessage) {
      if (!wiring.csrfSecret || Buffer.byteLength(wiring.csrfSecret) < 32) return null;
      const viewer = await wiring.viewers.customer(request as Request);
      if (!viewer.capabilities.has("assisted_orders:submit")) return null;
      let actorId: string;
      let sessionBinding: string;
      if (viewer.actorType === "member" && viewer.memberId && viewer.authUserId && UUID.test(viewer.authUserId)) {
        // The canonical resolver already validated this bearer and derived the
        // member. Hashing its bytes only scopes CSRF to that verified session.
        const authorization = request.headers.authorization;
        if (typeof authorization !== "string" || !/^Bearer \S+$/i.test(authorization)) return null;
        actorId = `member:${viewer.authUserId}`;
        sessionBinding = digest(authorization);
      } else if (viewer.actorType === "early_access_session" && viewer.earlyAccessCustomerRef && viewer.earlyAccessSessionHash) {
        actorId = `early_access:${viewer.earlyAccessCustomerRef}`;
        sessionBinding = viewer.earlyAccessSessionHash;
      } else return null;
      const session = Object.freeze({
        actorId,
        csrfToken: createHmac("sha256", wiring.csrfSecret)
          .update(JSON.stringify(["quick-order-csrf-v1", actorId, sessionBinding])).digest("base64url"),
      });
      viewers.set(session, viewer);
      return session;
    },
    async config(session) {
      const config = await wiring.service.config(viewerFor(session));
      const agreements = quickOrderAgreements(config, wiring.approvedHealthAgreementPairs);
      return { enabled: false, agreements: agreements ?? [], disabledReason: agreements
        ? "Quick Order is awaiting request-storage and access verification."
        : "Published agreements for this request are not available." };
    },
    async listCatalog(session, query) {
      return wiring.catalog.listCatalog(viewerFor(session), query);
    },
    async resolveItem(session, productId, variantId, state) {
      return wiring.catalog.resolveItem(viewerFor(session), productId, variantId, state);
    },
    async takeRateLimit(session, request) {
      viewerFor(session);
      const address = requestIp(request as Request);
      if (address === "unknown") return false;
      const write = request.method === "POST";
      const allowed = await rateLimitHit(`quick-order:${write ? "write" : "read"}:actor:${digest(session.actorId)}`, 60, write ? 10 : 90, { durableFailurePolicy: "deny" });
      return allowed && await rateLimitHit(`quick-order:${write ? "write" : "read"}:network:${digest(address)}`, 60, write ? 30 : 180, { durableFailurePolicy: "deny" });
    },
    async getExisting(session, key) {
      const viewer = viewerFor(session);
      if (!wiring.assistedOrderExtension) throw new Error("Quick Order canonical replay unavailable");
      return wiring.assistedOrderExtension.getExisting(viewer, session.actorId, key);
    },
    async commit(session, _args) {
      viewerFor(session);
      // Do not call legacy submit: it cannot atomically persist all required
      // facts and revalidate current authority. No direct RPC workaround.
      throw new Error("Quick Order canonical transaction is not qualified");
    },
  };
}
