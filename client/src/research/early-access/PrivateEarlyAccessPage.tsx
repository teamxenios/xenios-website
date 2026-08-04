import { useId } from "react";
import {
  isEarlyAccessPaymentOptionCode,
  parseEarlyAccessPaymentOptionsPresentation,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import { ResearchPendingPanel, ResearchSecureNotice } from "../ui/kit";
import { PaymentMethodSelector } from "./PaymentMethodSelector";

export interface PrivateEarlyAccessPageProps {
  /**
   * Unknown until a separately reviewed access boundary proves all four exact
   * readiness gates. No truthy shortcut or string alias opens this page.
   */
  accessState: unknown;
  /** Untrusted until the shared strict wire decoder accepts it. */
  paymentOptions: unknown;
  selectedPaymentMethod: EarlyAccessPaymentOptionCode | null;
  onPaymentMethodSelect: (code: EarlyAccessPaymentOptionCode) => void;
  selectionDisabled?: boolean;
}

const ACCESS_READY_KEYS = ["configured", "approved", "verified", "enabled"] as const;

/**
 * Access state is an exact browser projection, never an authority decision.
 * Descriptors are read without evaluating accessors, and structuredClone keeps
 * transparent Proxy objects from imitating an ordinary record.
 */
function isPrivateAccessReady(value: unknown): boolean {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return false;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== ACCESS_READY_KEYS.length ||
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          !(ACCESS_READY_KEYS as readonly string[]).includes(key),
      )
    ) {
      return false;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    for (const key of ACCESS_READY_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true ||
        descriptor.value !== true
      ) {
        return false;
      }
    }
    if (typeof structuredClone !== "function") return false;
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unmounted, controlled presentation for Private Early Access.
 *
 * This component does not discover access, payment configuration, receiving
 * details, or order state. It has no network, storage, navigation, submission,
 * or payment effect. A future route boundary must supply the independently
 * verified access state and strict payment-options projection.
 */
export function PrivateEarlyAccessPage({
  accessState,
  paymentOptions,
  selectedPaymentMethod,
  onPaymentMethodSelect,
  selectionDisabled = false,
}: PrivateEarlyAccessPageProps) {
  const headingId = useId();
  const selectionHeadingId = useId();
  const decoded = isPrivateAccessReady(accessState)
    ? parseEarlyAccessPaymentOptionsPresentation(paymentOptions)
    : null;
  const available = decoded?.state === "resolved" && decoded.codes.length > 0;
  const selected =
    available &&
    isEarlyAccessPaymentOptionCode(selectedPaymentMethod) &&
    decoded.codes.includes(selectedPaymentMethod)
      ? selectedPaymentMethod
      : null;

  return (
    <main
      aria-labelledby={headingId}
      className="research-app container-x min-w-0"
      data-testid="private-early-access-page"
      style={{
        paddingTop: "clamp(32px, 6vw, 64px)",
        paddingBottom: "clamp(48px, 8vw, 80px)",
      }}
    >
      <header className="ra-pagehead min-w-0">
        <p className="mono-cap text-pulse">Invitation only</p>
        <h1
          id={headingId}
          className="display-s text-balance mt-2"
          style={{ maxWidth: "24ch" }}
          tabIndex={-1}
        >
          Private Early Access
        </h1>
        <p className="body-m text-ink-2 mt-3 max-w-[58ch] text-balance">
          A controlled preview for an invited access session. This page does
          not collect, send, or confirm payment.
        </p>
      </header>

      <div className="mt-8 grid w-full min-w-0 max-w-[720px] gap-6">
        <ResearchSecureNotice>
          Access and available payment categories must be resolved before any
          choice appears. Transfer details are never displayed here.
        </ResearchSecureNotice>

        {!available ? (
          <ResearchPendingPanel
            kind="unavailable"
            title="Private access is not available yet."
            body="Payment categories will appear only after this private access session and its allowed methods are resolved. Nothing has been submitted or paid."
            testid="private-early-access-pending"
          />
        ) : (
          <section
            aria-labelledby={selectionHeadingId}
            className="card min-w-0"
            data-testid="private-early-access-selection"
          >
            <p className="mono-label text-ink-mute">Payment preference</p>
            <h2 id={selectionHeadingId} className="body-l font-700 mt-2 text-balance">
              Payment category selection
            </h2>
            <p aria-live="polite" className="body-s text-ink-2 mt-2 max-w-[62ch]" role="status">
              Choosing one category does not initiate or confirm a payment.
              Apple Cash is not Apple Pay; Apple Pay is not offered here.
            </p>
            <div className="mt-6 min-w-0">
              <PaymentMethodSelector
                presentation={decoded}
                selectedCode={selected}
                onSelect={onPaymentMethodSelect}
                disabled={selectionDisabled}
                testId="private-early-access-payment-methods"
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default PrivateEarlyAccessPage;
