import { useId, useState } from "react";
import {
  parseEarlyAccessPaymentInstructionsPresentation,
  type EarlyAccessPaymentInstruction,
} from "@shared/research/early-access-payment-instructions";
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
  return (
    <article
      className="card min-w-0 p-5"
      data-testid={`${testId}-method-${method.code}`}
    >
      <h4 className="body-m font-700 min-w-0 break-words">{method.methodName}</h4>

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
            Open {method.methodName}
          </a>
        ) : null}
      </div>
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

  if (decoded === null || decoded.state !== "resolved") {
    return (
      <ResearchPendingPanel
        kind="unavailable"
        title="Payment details are being confirmed."
        body="Where to send this payment will appear here once it is confirmed for your order. Nothing has been sent, and this order has not been paid."
        testid={`${testId}-pending`}
      />
    );
  }

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
          Only methods confirmed for this order appear here. Copying a value or
          opening a link does not send money and does not mark this order paid.
          A named Xenios operator verifies every payment before anything ships.
        </p>
      </div>

      <ResearchSecureNotice>
        Send the exact amount due and include the payment reference so your
        transfer can be matched to this order.
      </ResearchSecureNotice>

      <section className="card p-5">
        <dl className="body-s grid grid-cols-[1fr_auto] gap-x-5 gap-y-3">
          <dt>Amount due</dt>
          <dd className="font-700" data-testid={`${testId}-amount-due`}>
            {/* Server-formatted. The browser renders the string as given. */}
            {decoded.amountDueDisplay} {decoded.currency}
          </dd>
        </dl>
      </section>

      <section className="card min-w-0 p-5">
        <p className="body-s text-ink-mute">{decoded.referenceLabel}</p>
        <p
          className="display-xs mt-2 break-all"
          data-testid={`${testId}-payment-reference`}
        >
          {decoded.paymentReference}
        </p>
        <CopyControl
          value={decoded.paymentReference}
          label="Copy payment reference"
          copiedLabel="Copied"
          onCopy={onCopy}
          testId={`${testId}-copy-reference`}
        />
      </section>

      {decoded.methods.length === 0 ? (
        <p
          className="card body-s text-ink-mute p-5"
          role="status"
          data-testid={`${testId}-no-methods`}
        >
          No payment methods have been confirmed for this order yet. Nothing has
          been sent, and this order has not been paid.
        </p>
      ) : (
        <div
          className="grid min-w-0 gap-3"
          data-testid={`${testId}-methods`}
        >
          {decoded.methods.map((method) => (
            <MethodCard
              key={method.code}
              method={method}
              onCopy={onCopy}
              testId={testId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default EarlyAccessPaymentInstructions;
