import type { Request } from "express";
import type { OriginalGuestProof, OriginalGuestProofReader } from "../../early-access/identity/original-guest-proof";
import type { AssistedOrderClock, AssistedOrderViewer } from "../ports";
import { sha256AssistedOrderHasher } from "../defaults";
// PROPOSAL PREREQUISITE: Root must grant the one-line export of the EXISTING
// private constant in ../express.ts. Its capability contents stay unchanged.
import { CUSTOMER_CAPABILITIES } from "../express";
import { RequestIntentPreparationError } from "./service";

export type PreparedFixtureGuestProjection = Readonly<{
  kind: "original_guest_projection";
  viewer: AssistedOrderViewer;
  /** Actual registered-reader H1 and DB expiry; neither is a write capability. */
  proof: OriginalGuestProof;
}>;
export type PreparedFixtureGuestResolver = (request: Pick<Request, "headers">) => Promise<PreparedFixtureGuestProjection | null>;
const unavailable = () => new RequestIntentPreparationError("request_preparation_unavailable", 503);
const proofKeys = ["customerRef", "sessionHandleHash", "expiresAtEpochMs"];

function closedProof(raw: unknown, now: number): OriginalGuestProof {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw unavailable();
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== proofKeys.length || keys.some(key => typeof key !== "string" || !proofKeys.includes(key))) throw unavailable();
  const value = (key: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !("value" in descriptor)) throw unavailable();
    return descriptor.value as unknown;
  };
  const customerRef = value("customerRef"), sessionHandleHash = value("sessionHandleHash"), expiresAtEpochMs = value("expiresAtEpochMs");
  if (typeof customerRef !== "string" || !/^eac_[a-f0-9]{32}$/u.test(customerRef)
    || typeof sessionHandleHash !== "string" || !/^[a-f0-9]{64}$/u.test(sessionHandleHash)
    || typeof expiresAtEpochMs !== "number" || !Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs <= 0
    || !Number.isFinite(new Date(expiresAtEpochMs).getTime()) || expiresAtEpochMs <= now) throw unavailable();
  return Object.freeze({ customerRef, sessionHandleHash, expiresAtEpochMs });
}

/** Only Root's actually registered original-guest reader supplies provenance.
 * No ordinary/selected/ready inference, primary/alias lookup, bearer fallback,
 * session mint, storage or native CAS/terminal authority is provided here.
 */
export function createPreparedFixtureGuestResolver(
  readOriginalGuestProof: OriginalGuestProofReader | null,
  clock: AssistedOrderClock | null,
): PreparedFixtureGuestResolver | null {
  if (typeof readOriginalGuestProof !== "function" || !clock || typeof clock.now !== "function") return null;
  const read = readOriginalGuestProof, now = clock.now.bind(clock);
  return async request => {
    // This is a guest-only boundary. A rejected/recovery/member bearer must
    // never silently become the cookie owner; ordinary routes stay separate.
    if (request.headers.authorization !== undefined) throw new RequestIntentPreparationError("request_preparation_refused", 401);
    try {
      const raw = await read(request.headers.cookie);
      if (raw === null) return null; // No guest proof, NOT ordinary selection.
      const current = now().getTime();
      if (!Number.isSafeInteger(current) || current < 0) throw unavailable();
      const proof = closedProof(raw, current);
      const viewer: AssistedOrderViewer = Object.freeze({ actorType: "early_access_session", memberId: null, authUserId: null,
        earlyAccessCustomerRef: proof.customerRef,
        // Exactly the canonical assisted-order guest H1 -> H2 projection.
        earlyAccessSessionHash: sha256AssistedOrderHasher.hash(proof.sessionHandleHash),
        normalizedEmail: null, capabilities: CUSTOMER_CAPABILITIES as AssistedOrderViewer["capabilities"] });
      return Object.freeze({ kind: "original_guest_projection", viewer, proof });
    } catch {
      // Preserve unavailable separately from genuine null without exposing a
      // cookie, provider error or expiry guess. No alternate identity is tried.
      throw unavailable();
    }
  };
}
