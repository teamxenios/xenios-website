/**
 * THE PAYMENT METHOD A SUBMISSION IS ALLOWED TO CLAIM.
 *
 * THE BUG THIS EXISTS TO PREVENT. The accelerator's proof selector carried a
 * hardcoded array of five methods and defaulted to Zelle. That is wrong three
 * separate ways. It offers methods a named human may never have approved. It
 * lets the browser assert which rail was used. And a default means a customer
 * who never chose anything still produces a record saying they paid by Zelle,
 * which is a fact nobody established and which an operator will later act on.
 *
 * THE RULE. The method must be one the LIVE server presentation currently
 * enables for THIS checkout, the customer must have chosen it explicitly, and
 * the choice is snapshotted with the governance version that was in force at
 * the moment of submission. There is no default anywhere in this file.
 *
 * WHY A GOVERNANCE FINGERPRINT RATHER THAN THE RECORD. The registry snapshot
 * carries twelve governance fields, including the references and roles that
 * decided a method was payable. Those belong behind the admin boundary, not in
 * a customer submission row and certainly not in an email. So the submission
 * stores a SHA-256 over the canonical governance tuple plus the enablement
 * instant. That is enough to prove later which approval record was in force,
 * and it discloses none of it. If the governance changes, the fingerprint
 * changes, and a stale browser cannot pretend otherwise.
 *
 * WHY THIS LANE DEFINES ITS OWN PORT. `resolveEarlyAccessPaymentOptionsPresentation`
 * publishes codes only, on purpose, and it is not this lane's file to change.
 * So the port below is the seam, and the adapter composes the existing registry
 * behind it without editing anything the cart lane owns.
 */

import { createHash } from "node:crypto";
import {
  earlyAccessPaymentOptionLabel,
  isEarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import type { EarlyAccessProofMethodSnapshot } from "../hardening-contract";
import { resolveEarlyAccessPaymentOptionsPresentation } from "../../commerce/manual-order-payment-method-adapter";
import {
  parseManualPaymentMethodSnapshot,
  type ManualPaymentClockPort,
  type ManualPaymentMethodRegistryPort,
} from "../../commerce/manual-order-payments";

/**
 * The method as the submission records it, in the frozen contract shape.
 *
 * `registryVersion` is the SHA-256 governance fingerprint described above, and
 * `presentedAt` is the instant the presentation the customer chose from was
 * built. The contract names both; this lane supplies them.
 */
export type PaymentMethodSnapshot = EarlyAccessProofMethodSnapshot;

export type PaymentMethodResolution =
  | Readonly<{ state: "resolved"; snapshot: PaymentMethodSnapshot }>
  /** The presentation itself could not be established. Fail closed, 503. */
  | Readonly<{ state: "unavailable" }>
  /** The presentation resolved and this method is not in it. Refuse, 400. */
  | Readonly<{ state: "not_enabled" }>;

/**
 * The seam the submission service resolves a chosen method through.
 *
 * `method` is the customer's explicit choice. There is no overload that omits
 * it, so no caller can accidentally get a default.
 */
export interface EarlyAccessProofPaymentPresentationPort {
  resolveChosenMethod(method: unknown): Promise<PaymentMethodResolution>;
}

/**
 * The governance tuple, in a fixed order, joined by a separator that cannot
 * appear in an opaque reference. Field order is part of the identity: shuffling
 * it would produce a different fingerprint for the same approval, so it is
 * written out once here and never derived from object key order.
 */
function governanceFingerprint(snapshot: {
  readonly configurationRef: string;
  readonly instructionsRef: string;
  readonly approvalRef: string;
  readonly approvedByRole: string;
  readonly approvedAt: string;
  readonly verificationRef: string;
  readonly verifiedByRole: string;
  readonly verifiedAt: string;
  readonly enablementRef: string;
  readonly enabledByRole: string;
  readonly enabledAt: string;
  readonly method: string;
}): string {
  const tuple = [
    snapshot.method,
    snapshot.configurationRef,
    snapshot.instructionsRef,
    snapshot.approvalRef,
    snapshot.approvedByRole,
    snapshot.approvedAt,
    snapshot.verificationRef,
    snapshot.verifiedByRole,
    snapshot.verifiedAt,
    snapshot.enablementRef,
    snapshot.enabledByRole,
    snapshot.enabledAt,
  ].join("\u0000");
  return createHash("sha256").update(tuple).digest("hex");
}

const UNAVAILABLE: PaymentMethodResolution = Object.freeze({ state: "unavailable" as const });
const NOT_ENABLED: PaymentMethodResolution = Object.freeze({ state: "not_enabled" as const });

/**
 * Compose the real registry into the port.
 *
 * TWO PASSES, ON PURPOSE. The first pass is the existing whole-registry
 * projection, which fails the ENTIRE presentation closed if any record is
 * malformed. The submission must not accept a method out of a registry that is
 * partially broken, so that projection runs first and its verdict is binding.
 * The second pass re-reads only the chosen method to capture its governance
 * fingerprint. Reading it twice is deliberate: the first read decides
 * admissibility, the second records identity, and the recorded identity is
 * verified to still be the enabled one.
 */
export function createRegistryPaymentPresentation(deps: {
  readonly methodRegistry: ManualPaymentMethodRegistryPort;
  readonly clock: ManualPaymentClockPort;
}): EarlyAccessProofPaymentPresentationPort {
  return Object.freeze({
    async resolveChosenMethod(method: unknown): Promise<PaymentMethodResolution> {
      // An explicit, well formed choice is a precondition, not a default.
      if (!isEarlyAccessPaymentOptionCode(method)) return NOT_ENABLED;

      let presentation: ReturnType<typeof resolveEarlyAccessPaymentOptionsPresentation>;
      let resolvedAt: string;
      try {
        presentation = resolveEarlyAccessPaymentOptionsPresentation({
          methodRegistry: deps.methodRegistry,
          clock: deps.clock,
        });
        resolvedAt = deps.clock.now();
      } catch {
        return UNAVAILABLE;
      }
      if (presentation.state !== "resolved") return UNAVAILABLE;
      if (!presentation.codes.includes(method)) return NOT_ENABLED;
      if (typeof resolvedAt !== "string" || resolvedAt.length === 0) return UNAVAILABLE;

      let raw: unknown;
      try {
        raw = deps.methodRegistry.resolveEnabledMethod({ method, evaluatedAt: resolvedAt });
      } catch {
        return UNAVAILABLE;
      }
      // The first pass admitted this code, so a null here means the registry
      // changed between the two reads. That is a genuine race and the safe
      // answer is to refuse the submission rather than record a method whose
      // approval is no longer resolvable.
      if (raw === null || raw === undefined) return UNAVAILABLE;

      let parsed: ReturnType<typeof parseManualPaymentMethodSnapshot>;
      try {
        parsed = parseManualPaymentMethodSnapshot(raw);
      } catch {
        return UNAVAILABLE;
      }
      if (parsed.state !== "accepted" || parsed.value.method !== method) return UNAVAILABLE;

      const methodName = earlyAccessPaymentOptionLabel(method);
      if (methodName === null) return UNAVAILABLE;

      return Object.freeze({
        state: "resolved" as const,
        snapshot: Object.freeze({
          code: method,
          methodName,
          registryVersion: governanceFingerprint(parsed.value),
          presentedAt: resolvedAt,
        }),
      });
    },
  });
}
