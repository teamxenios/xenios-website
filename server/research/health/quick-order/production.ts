import { createHash, createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { IncomingMessage } from "node:http";
import type { Request } from "express";
import type { AssistedOrderService } from "../../assisted-order/service";
import type { AssistedOrderViewer } from "../../assisted-order/ports";
import type { createAssistedOrderViewerResolvers } from "../../assisted-order/express";
import { rateLimitHit, requestIp } from "../../rate-limit";
import { quickOrderAgreements } from "./legal";
import type { createQuickOrderCanonicalCatalog } from "./catalog";
import type { QuickOrderAssistedOrderExtension, QuickOrderAttempt, QuickOrderDisabledTransactionExtension, QuickOrderPorts, QuickOrderSession } from "./ports";

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
  assistedOrderExtension: QuickOrderAssistedOrderExtension | QuickOrderDisabledTransactionExtension | null;
}

/** Concrete adapters for the authorities that already exist. Deliberately not
 * mounted and not activatable: the candidate transaction and its private
 * admission contract have not been independently accepted or qualified. A flag
 * cannot supply installation, trusted bindings or execution evidence.
 */
export function createQuickOrderProductionPorts(wiring: QuickOrderProductionWiring): QuickOrderPorts {
  const viewers = new WeakMap<QuickOrderSession, AssistedOrderViewer>();
  const attempts = new WeakMap<QuickOrderSession, QuickOrderAttempt>();
  const extension = wiring.assistedOrderExtension;
  const candidate = extension && "beginAttempt" in extension && "commitAttempt" in extension && "monotonicNow" in extension
    && typeof extension.beginAttempt === "function" && typeof extension.commitAttempt === "function" && typeof extension.monotonicNow === "function"
    ? extension as QuickOrderDisabledTransactionExtension : null;
  const viewerFor = (session: QuickOrderSession): AssistedOrderViewer => {
    const viewer = viewers.get(session);
    if (!viewer) throw new Error("Quick Order session unavailable");
    return viewer;
  };
  return {
    productionReady: false,
    async session(request: IncomingMessage) {
      // First operation: include authentication, rate/body, replay and catalog
      // time. This clock limits observation; it cannot arm a database timer or
      // establish the excluded transport/handler's whole-request contract.
      const enteredAtMonotonicMs = candidate ? candidate.monotonicNow() : performance.now();
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
      const attempt = candidate?.beginAttempt(viewer, actorId, enteredAtMonotonicMs);
      if (attempt) attempts.set(session, attempt);
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
    async commit(session, args) {
      const viewer = viewerFor(session);
      const attempt = attempts.get(session);
      // The real composition supplies no candidate/private proof. Tests alone
      // inject the disabled extension. Neither enabled flag is changed by it.
      if (!candidate || !attempt) throw new Error("Quick Order canonical transaction is not qualified");
      return candidate.commitAttempt(viewer, session.actorId, args, attempt);
    },
  };
}
