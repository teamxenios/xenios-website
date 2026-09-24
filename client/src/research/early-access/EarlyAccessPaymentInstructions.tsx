import { useId, useState } from "react";
import {
  parseEarlyAccessPaymentInstructionsPresentation,
  type EarlyAccessPaymentInstruction,
} from "@shared/research/early-access-payment-instructions";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  earlyAccessPaymentOptionLabel,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import { ResearchPendingPanel, ResearchSecureNotice } from "../ui/kit";

/**
 * The customer-facing "how to pay" panel for an Early Access order.
 *
 * Presentation only, and deliberately inert. This component does not discover
 * payment configuration, does not choose which methods exist, performs no
 * network call, and has no submit path. Selecting or copying a value here does
 * not mark the payment received, settle the checkout, issue a receipt, release
 * a supplier, or create a supplier outbox entry. The order stays
 * awaiting_payment until a named admin verifies the transfer.
 *
 * Every value comes from the server. The amount due arrives already formatted,
 * so this file contains NO money arithmetic of any kind: nothing is divided,
 * summed, discounted, or re-totalled in the browser.
 */

export interface EarlyAccessPaymentInstructionsProps {
  /** Untrusted until the shared strict wire decoder accepts it. */
  presentation: unknown;
  /** Injected in tests. Defaults to the browser clipboard, which may be absent. */
  onCopy?: (value: string) => void;
  testId?: string;
}

function defaultCopy(value: string): void {
  void navigator.clipboard?.writeText(value);
}

function CopyControl({
  value,
  label,
  copiedLabel,
  onCopy,
  testId,
}: Readonly<{
  value: string;
  label: string;
  copiedLabel: string;
  onCopy: (value: string) => void;
  testId: string;
}>) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary mt-3"
      data-testid={testId}
      onClick={() => {
        onCopy(value);
        setCopied(true);
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

function MethodCard({
  method,
  onCopy,
  testId,
}: Readonly<{
  method: EarlyAccessPaymentInstruction;
  onCopy: (value: string) => void;
  testId: string;
}>) {
  const customerName =
    earlyAccessPaymentOptionLabel(method.code) ?? method.methodName;
  return (
    <article
      className="card min-w-0 p-5"
      data-testid={`${testId}-method-${method.code}`}
    >
      <h4 className="body-m font-700 min-w-0 break-words">{customerName}</h4>

      {method.destinationValue !== null ? (
        <div className="mt-3 min-w-0">
          <p className="body-s text-ink-mute">
            {method.destinationLabel ?? "Send to"}
          </p>
          <p
            className="body-m font-700 mt-1 break-all"
            data-testid={`${testId}-destination-${method.code}`}
          >
            {method.destinationValue}
          </p>
        </div>
      ) : null}

      {method.steps.length > 0 ? (
        <ol
          className="body-s text-ink-2 mt-3 grid list-decimal gap-1 pl-5"
          data-testid={`${testId}-steps-${method.code}`}
        >
          {method.steps.map((step, index) => (
            <li key={`${method.code}-step-${index}`} className="break-words">
              {step}
            </li>
          ))}
        </ol>
      ) : null}

      {method.referenceRequired ? (
        <p
          className="body-s font-700 mt-3"
          data-testid={`${testId}-reference-required-${method.code}`}
        >
          Include the payment reference with this transfer.
        </p>
      ) : (
        <p
          className="body-s text-ink-mute mt-3"
          data-testid={`${testId}-reference-optional-${method.code}`}
        >
          A payment reference is not required for this method, and including it
          still helps a reviewer match your transfer.
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-3">
        {method.copyValue !== null ? (
          <CopyControl
            value={method.copyValue}
            label="Copy payment details"
            copiedLabel="Copied"
            onCopy={onCopy}
            testId={`${testId}-copy-${method.code}`}
          />
        ) : null}
        {method.paymentUrl !== null ? (
          // Decoded upstream: absolute https, no embedded credentials.
          <a
            className="btn btn-secondary mt-3"
            href={method.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`${testId}-link-${method.code}`}
          >
            Open {customerName}
          </a>
        ) : null}
      </div>
    </article>
  );
}

const CONTACT_COPY: Readonly<Record<EarlyAccessPaymentOptionCode, string>> =
  Object.freeze({
    zelle: "Contact Xenios to arrange payment by Zelle.",
    venmo: "Contact Xenios to arrange payment by Venmo.",
    cash_app: "Contact Xenios to arrange payment by Cash App.",
    paypal: "Contact Xenios to arrange payment by PayPal.",
    apple_cash: "Prefer Apple Pay? Contact Xenios to arrange payment.",
    ach_wire:
      "Contact Xenios for the current approved ACH, bank transfer, or wire instructions.",
    other:
      "Need another way to pay? Contact Samuel directly at 737-418-6381.",
  });

const MANUAL_PAYMENT_SUPPORT = Object.freeze({
  name: "Samuel",
  phoneDisplay: "737-418-6381",
  phoneHref: "tel:7374186381",
});

function ContactFallbackCard({
  code,
  testId,
}: Readonly<{ code: EarlyAccessPaymentOptionCode; testId: string }>) {
  return (
    <article
      className="card min-w-0 p-5"
      data-testid={`${testId}-method-${code}`}
      data-payment-action="contact"
    >
      <h4 className="body-m font-700 min-w-0 break-words">
        {earlyAccessPaymentOptionLabel(code)}
      </h4>
      <p className="body-s text-ink-2 mt-3 max-w-[62ch]">
        {CONTACT_COPY[code]}
      </p>
      <a
        className="btn btn-secondary mt-3"
        href={MANUAL_PAYMENT_SUPPORT.phoneHref}
        data-testid={`${testId}-contact-${code}`}
      >
        Call {MANUAL_PAYMENT_SUPPORT.name} at{" "}
        {MANUAL_PAYMENT_SUPPORT.phoneDisplay}
      </a>
    </article>
  );
}

export function EarlyAccessPaymentInstructions({
  presentation,
  onCopy = defaultCopy,
  testId = "early-access-payment-instructions",
}: EarlyAccessPaymentInstructionsProps) {
  const headingId = useId();
  const decoded = parseEarlyAccessPaymentInstructionsPresentation(presentation);
  const resolved = decoded?.state === "resolved" ? decoded : null;
  const configuredMethods = new Map(
    (resolved?.methods ?? []).map((method) => [method.code, method] as const),
  );

  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 gap-5"
      data-testid={testId}
    >
      <div>
        <h3 id={headingId} className="body-m font-700">
          How to pay
        </h3>
        <p className="body-s text-ink-mute mt-2 max-w-[62ch]">
          Choose the payment method that works best for you. Where direct
          payment instructions are available, they appear below. If you need
          another method or help completing payment, contact Samuel at{" "}
          {MANUAL_PAYMENT_SUPPORT.phoneDisplay}. Copying a value, opening a link,
          or calling does not send money and does not mark this order paid.
          Xenios verifies every payment before anything ships.
        </p>
      </div>

      <ResearchSecureNotice>
        Send the exact amount due and include the payment reference so your
        transfer can be matched to this order.
      </ResearchSecureNotice>

      {resolved === null ? (
        <ResearchPendingPanel
          kind="unavailable"
          title="Direct payment details are being confirmed."
          body="You can still choose a payment option below and contact Xenios to arrange it. Nothing has been sent, and this order has not been paid."
          testid={`${testId}-pending`}
        />
      ) : (
        <>
          <section className="card p-5">
            <dl className="body-s grid grid-cols-[1fr_auto] gap-x-5 gap-y-3">
              <dt>Amount due</dt>
              <dd className="font-700" data-testid={`${testId}-amount-due`}>
                {/* Server-formatted. The browser renders the string as given. */}
                {resolved.amountDueDisplay} {resolved.currency}
              </dd>
            </dl>
          </section>

          <section className="card min-w-0 p-5">
            <p className="body-s text-ink-mute">{resolved.referenceLabel}</p>
            <p
              className="display-xs mt-2 break-all"
              data-testid={`${testId}-payment-reference`}
            >
              {resolved.paymentReference}
            </p>
            <CopyControl
              value={resolved.paymentReference}
              label="Copy payment reference"
              copiedLabel="Copied"
              onCopy={onCopy}
              testId={`${testId}-copy-reference`}
            />
          </section>
        </>
      )}

      <div
        className="grid min-w-0 gap-3"
        data-testid={`${testId}-methods`}
      >
        {EARLY_ACCESS_PAYMENT_OPTION_CODES.map((code) => {
          const method = configuredMethods.get(code);
          return method === undefined ? (
            <ContactFallbackCard key={code} code={code} testId={testId} />
          ) : (
            <MethodCard
              key={code}
              method={method}
              onCopy={onCopy}
              testId={testId}
            />
          );
        })}
      </div>
    </section>
  );
}

export default EarlyAccessPaymentInstructions;
