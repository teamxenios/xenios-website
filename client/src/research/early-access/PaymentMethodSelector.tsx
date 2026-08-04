import { useId } from "react";
import {
  earlyAccessPaymentOptionLabel,
  normalizeEarlyAccessPaymentOptionCodes,
  type EarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionsPresentation,
} from "@shared/research/early-access-payment-options";

export interface PaymentMethodSelectorProps {
  presentation: EarlyAccessPaymentOptionsPresentation;
  selectedCode: EarlyAccessPaymentOptionCode | null;
  onSelect: (code: EarlyAccessPaymentOptionCode) => void;
  disabled?: boolean;
  testId?: string;
}

/**
 * Presentation only. The caller owns the separately reviewed server decision
 * that produced `presentation`; this component never discovers, configures,
 * submits, or verifies a payment method.
 */
export function PaymentMethodSelector({
  presentation,
  selectedCode,
  onSelect,
  disabled = false,
  testId = "early-access-payment-method-selector",
}: PaymentMethodSelectorProps) {
  const baseId = useId();
  const noteId = `${baseId}-note`;
  const groupName = `${baseId}-payment-method`;
  const codes =
    presentation.state === "resolved"
      ? normalizeEarlyAccessPaymentOptionCodes(presentation.codes)
      : [];

  return (
    <fieldset
      className="grid min-w-0 gap-4 border-0 p-0"
      aria-describedby={noteId}
      disabled={disabled}
      data-testid={testId}
    >
      <legend className="body-m font-700">Choose a payment method</legend>
      <p id={noteId} className="body-s text-ink-2 max-w-[62ch]">
        Only methods confirmed for this order appear here. Choosing a method
        does not send money or mark this order paid. Transfer details are not
        displayed in this selector.
      </p>

      {presentation.state === "unresolved" ? (
        <p className="card body-s text-ink-mute" role="status">
          Payment methods are being confirmed for this order.
        </p>
      ) : codes.length === 0 ? (
        <p className="card body-s text-ink-mute" role="status">
          No payment methods have been confirmed for this order yet.
        </p>
      ) : (
        <div
          className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
          data-testid={`${testId}-options`}
        >
          {codes.map((code) => {
            const inputId = `${baseId}-${code}`;
            const selected = selectedCode === code;
            return (
              <label
                key={code}
                htmlFor={inputId}
                className={`ra-select-card min-w-0 break-words ${
                  selected ? "ra-select-card-on" : ""
                }`}
                data-testid={`${testId}-option-${code}`}
              >
                <input
                  id={inputId}
                  name={groupName}
                  type="radio"
                  value={code}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onSelect(code)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--pulse)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pulse)]"
                />
                <span className="body-m font-700 min-w-0 break-words">
                  {earlyAccessPaymentOptionLabel(code)}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export default PaymentMethodSelector;
