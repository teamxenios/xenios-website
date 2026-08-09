/**
 * THE PROTECTED PAYMENT-METHOD REGISTRY, AS PRODUCTION CONFIGURATION.
 *
 * WHAT THIS IS FOR. `createEarlyAccessCartPaymentInstructionsRoute` takes a
 * `ManualPaymentMethodRegistryPort`, and until now the only implementations of
 * that port were test doubles. Configuration alone must never make a method
 * payable: `EARLY_ACCESS_PAYMENT_INSTRUCTIONS` says where money would go, and
 * this registry says which methods a named human has approved, verified and
 * enabled, and when. Two questions, two sources, both server-side.
 *
 * WHY IT IS NOT A LIST OF METHOD NAMES. The snapshot the manual-payment
 * adapter validates carries twelve fields: a configuration, instructions,
 * approval, verification and enablement reference, three named roles, and three
 * canonical timestamps. Those are governance facts about who decided what. An
 * environment variable holding `{"zelle": "2026-08-09"}` and a function
 * inventing the other ten fields would be manufacturing an approval record,
 * which is the same class of mistake as inventing a tracking event or a payment
 * destination. So this reads the WHOLE record from the deployment and hands it
 * to `parseManualPaymentMethodSnapshot` unchanged. Every field is supplied by
 * whoever configured production; none is synthesised here.
 *
 * FAIL-CLOSED, TWICE OVER. An absent variable, unparseable JSON, a non-object,
 * a method that is not in the document, or a record the snapshot parser refuses
 * all resolve to "this method is not enabled". The route then presents the
 * unresolved state, which the customer reads as payment details being
 * confirmed. No path here can turn a malformed document into a payable method.
 *
 * THE CLIENT CANNOT REACH THIS. The only input is `method`, a code from the
 * server's own enumeration. Nothing from the request body, query or cookie
 * selects a record.
 *
 * THE DURABLE UPGRADE PATH. `research_fm_payment_method_versions` is a real
 * append-only table holding this exact shape for the Founding Membership lane.
 * When Early Access earns durable approval records, this port is where that
 * table plugs in, and the route above it does not change.
 */

import type {
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../../commerce/manual-order-payments";

export const EARLY_ACCESS_PAYMENT_METHOD_REGISTRY_ENV =
  "EARLY_ACCESS_PAYMENT_METHOD_REGISTRY";

/** The seam the document arrives through. Injected, so tests never touch env. */
export interface EarlyAccessPaymentMethodRegistrySource {
  /** The raw document, or null when the deployment configured none. */
  read(): unknown;
}

export function createEnvPaymentMethodRegistrySource(
  env: NodeJS.ProcessEnv,
): EarlyAccessPaymentMethodRegistrySource {
  return Object.freeze({
    read(): unknown {
      const raw = env[EARLY_ACCESS_PAYMENT_METHOD_REGISTRY_ENV];
      if (typeof raw !== "string" || raw.trim() === "") return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        // A malformed document is not an empty one, but both mean the same
        // thing to a customer: no method is enabled. Reporting the difference
        // here would put configuration detail in a log for no benefit.
        return null;
      }
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one method's record out of the configured document.
 *
 * Returns the record verbatim. It is deliberately NOT validated here: the
 * adapter owns validation, and a second, looser check in this file would be a
 * place for the two to disagree.
 */
export function createConfiguredPaymentMethodRegistry(
  source: EarlyAccessPaymentMethodRegistrySource,
): ManualPaymentMethodRegistryPort {
  return Object.freeze({
    resolveEnabledMethod(input: { method: string; evaluatedAt: string }): unknown {
      let document: unknown;
      try {
        document = source.read();
      } catch {
        return null;
      }
      if (!isRecord(document)) return null;
      const record = document[input.method];
      return isRecord(record) ? record : null;
    },
  });
}

/** The server's clock, as the port the manual-payment adapter expects. */
export function createSystemPaymentClock(): ManualPaymentClockPort {
  return Object.freeze({
    now(): string {
      return new Date().toISOString();
    },
  });
}
