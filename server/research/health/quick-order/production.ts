import { createHash, createHmac } from "node:crypto";
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
  /** Read the immutable Node HTTP entry stamp from the root-owned WeakMap.
   * Same clock/origin as the candidate runtime.now; sampled before Express,
   * target/origin/auth/body work. Never a proxy/socket-arrival claim or fallback. */
  enteredAtMonotonicMsFor(req: IncomingMessage): number | null;
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
  const sessions = new WeakMap<IncomingMessage, Promise<QuickOrderSession | null>>();
  const admission = new WeakMap<QuickOrderSession, {
    enteredAtMonotonicMs: number | null;
    lookupClaimed: boolean;
    commitClaimed: boolean;
    attempt: { token: QuickOrderAttempt; key: string; payloadHash: string } | null;
  }>();
  const extension = wiring.assistedOrderExtension;
  const candidate = extension && "beginAttempt" in extension && "commitAttempt" in extension && "monotonicNow" in extension
    && typeof extension.beginAttempt === "function" && typeof extension.commitAttempt === "function" && typeof extension.monotonicNow === "function"
    ? extension as QuickOrderDisabledTransactionExtension : null;
  const viewerFor = (session: QuickOrderSession): AssistedOrderViewer => {
    const viewer = viewers.get(session);
    if (!viewer) throw new Error("Quick Order session unavailable");
    return viewer;
  };
  const entryStampFor = (request: IncomingMessage): number | null => {
    try {
      const stamp = wiring.enteredAtMonotonicMsFor(request);
      const observed = candidate?.monotonicNow();
      return typeof stamp === "number" && Number.isFinite(stamp) && stamp >= 0
        && typeof observed === "number" && Number.isFinite(observed) && observed >= stamp ? stamp : null;
    } catch { return null; } // Missing timing cannot deny authorized recovery.
  };
  const authenticate = async (request: IncomingMessage, enteredAtMonotonicMs: number | null): Promise<QuickOrderSession | null> => {
    if (!wiring.csrfSecret || Buffer.byteLength(wiring.csrfSecret) < 32) return null;
    const viewer = await wiring.viewers.customer(request as Request);
    if (!viewer.capabilities.has("assisted_orders:submit")) return null;
    let actorId: string;
    let sessionBinding: string;
    if (viewer.actorType === "member" && viewer.memberId && viewer.authUserId && UUID.test(viewer.authUserId)) {
      // Canonical authentication validates the bearer. This digest scopes CSRF
      // only; it is never the private rawStoredSessionHash admission proof.
      const authorization = request.headers.authorization;
      if (typeof authorization !== "string" || !/^Bearer \S+$/i.test(authorization)) return null;
      actorId = `member:${viewer.authUserId}`;
      sessionBinding = digest(authorization);
    } else if (viewer.actorType === "early_access_session" && viewer.earlyAccessCustomerRef && viewer.earlyAccessSessionHash) {
      actorId = `early_access:${viewer.earlyAccessCustomerRef}`;
      // Canonical viewer value is deliberately double-hashed. Use only for
      // CSRF; the candidate's privateContextFor supplies the raw stored hash.
      sessionBinding = viewer.earlyAccessSessionHash;
    } else return null;
    const session = Object.freeze({
      actorId,
      csrfToken: createHmac("sha256", wiring.csrfSecret)
        .update(JSON.stringify(["quick-order-csrf-v1", actorId, sessionBinding])).digest("base64url"),
    });
    viewers.set(session, viewer);
    admission.set(session, { enteredAtMonotonicMs, lookupClaimed: false, commitClaimed: false, attempt: null });
    return session;
  };
  return {
    productionReady: false,
    session(request: IncomingMessage) {
      const existing = sessions.get(request);
      if (existing) return existing;
      // Read the original stamp once, never sample a replacement. Retain one
      // authenticated identity/attempt slot even if the same request is re-used.
      const enteredAtMonotonicMs = entryStampFor(request);
      const pending = authenticate(request, enteredAtMonotonicMs);
      sessions.set(request, pending);
      return pending;
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
    async getExisting(session, key, payloadHash) {
      const viewer = viewerFor(session);
      if (!extension) throw new Error("Quick Order canonical replay unavailable");
      const state = admission.get(session)!;
      // Claim before awaiting recovery: concurrent/repeated lookups cannot arm
      // two attempts or refresh a deadline/key after an uncertain outcome.
      const firstLookup = !state.lookupClaimed;
      state.lookupClaimed = true;
      const existing = await extension.getExisting(viewer, session.actorId, key);
      if (existing !== null) {
        if (!existing || typeof existing !== "object") throw new Error("Quick Order canonical replay unavailable");
        return existing;
      }
      // A lookup without the handler's derived hash remains recovery-only.
      // Do not derive private context for a receipt hit, conflict or failed read.
      if (firstLookup && !state.commitClaimed && candidate && state.enteredAtMonotonicMs !== null
        && /^[A-Za-z0-9_-]{16,80}$/.test(key) && typeof payloadHash === "string" && /^[a-f0-9]{64}$/.test(payloadHash)) {
        try {
          const observed = candidate.monotonicNow();
          if (Number.isFinite(observed) && observed >= state.enteredAtMonotonicMs) {
            const token = candidate.beginAttempt(viewer, session.actorId, state.enteredAtMonotonicMs);
            if (token?.enteredAtMonotonicMs === state.enteredAtMonotonicMs) state.attempt = { token, key, payloadHash };
          }
        } catch { /* No alternate proof, timestamp or transaction route. */ }
      }
      return null;
    },
    async commit(session, args) {
      const viewer = viewerFor(session);
      const state = admission.get(session)!;
      const attempt = state.attempt;
      state.commitClaimed = true;
      state.attempt = null; // Consume before validation or any asynchronous work.
      if (!candidate || !attempt || args?.input?.idempotencyKey !== attempt.key || args?.payloadHash !== attempt.payloadHash) {
        throw new Error("Quick Order canonical transaction is not qualified");
      }
      // Candidate independently validates content/hash, original deadline and
      // single use. No cancellation/rollback/commit proof follows from this clock.
      return candidate.commitAttempt(viewer, session.actorId, args, attempt.token);
    },
  };
}
