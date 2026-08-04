/**
 * Server-only presentation adapter for Early Access manual-payment choices.
 *
 * This adapter publishes category codes only. It never publishes protected
 * registry references, instructions, identities, roles, or timestamps. Its
 * result is deliberately non-authoritative: `createManualOrderInvoice` must
 * resolve the selected method from the protected registry again at the action
 * boundary before an invoice can be created.
 */

import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  parseManualPaymentMethodSnapshot,
  type ManualPaymentClockPort,
  type ManualPaymentMethodRegistryPort,
} from "./manual-order-payments";

export interface ResolveEarlyAccessPaymentOptionsInput {
  readonly methodRegistry: ManualPaymentMethodRegistryPort;
  readonly clock: ManualPaymentClockPort;
}

export type EarlyAccessPaymentOptionsResolution =
  | Readonly<{ state: "unresolved" }>
  | Readonly<{
      state: "resolved";
      codes: readonly EarlyAccessPaymentOptionCode[];
    }>;

function unresolved(): EarlyAccessPaymentOptionsResolution {
  return Object.freeze({ state: "unresolved" as const });
}

function readCanonicalEvaluationTime(
  clock: ManualPaymentClockPort,
): Readonly<{ value: string; milliseconds: number }> | null {
  let value: unknown;
  try {
    value = clock.now();
  } catch {
    return null;
  }
  if (typeof value !== "string") return null;
  const milliseconds = parseProductControlTimestamp(value);
  if (
    milliseconds === null ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return null;
  }
  return Object.freeze({ value, milliseconds });
}

/**
 * Resolve the customer-safe presentation categories from one complete
 * protected-registry pass at a single evaluation instant. `null` means a
 * healthy but unavailable method. Any
 * other malformed response fails the entire projection closed so callers can
 * never render a partial result after a registry or validation failure.
 */
export function resolveEarlyAccessPaymentOptionsPresentation(
  input: ResolveEarlyAccessPaymentOptionsInput,
): EarlyAccessPaymentOptionsResolution {
  const evaluatedAt = readCanonicalEvaluationTime(input.clock);
  if (evaluatedAt === null) return unresolved();

  const codes: EarlyAccessPaymentOptionCode[] = [];
  for (const code of EARLY_ACCESS_PAYMENT_OPTION_CODES) {
    let rawSnapshot: unknown;
    try {
      rawSnapshot = input.methodRegistry.resolveEnabledMethod({
        method: code,
        evaluatedAt: evaluatedAt.value,
      });
    } catch {
      return unresolved();
    }
    if (rawSnapshot === null) continue;

    try {
      const snapshot = parseManualPaymentMethodSnapshot(rawSnapshot);
      if (snapshot.state !== "accepted") return unresolved();
      const enabledAt = parseProductControlTimestamp(snapshot.value.enabledAt);
      if (
        snapshot.value.method !== code ||
        enabledAt === null ||
        enabledAt > evaluatedAt.milliseconds
      ) {
        return unresolved();
      }
    } catch {
      return unresolved();
    }
    codes.push(code);
  }

  return Object.freeze({
    state: "resolved" as const,
    codes: Object.freeze([...codes]),
  });
}
