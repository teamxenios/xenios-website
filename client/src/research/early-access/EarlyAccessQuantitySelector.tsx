import { useId } from "react";

/** The only quantities this early access round offers. */
export const EARLY_ACCESS_QUANTITIES = [1, 2, 3] as const;

export type EarlyAccessQuantity = (typeof EARLY_ACCESS_QUANTITIES)[number];

export function isEarlyAccessQuantity(value: unknown): value is EarlyAccessQuantity {
  return (EARLY_ACCESS_QUANTITIES as readonly unknown[]).includes(value);
}

export interface EarlyAccessQuantitySelectorProps {
  /** The caller's current choice. Anything outside the offered set selects nothing. */
  value: EarlyAccessQuantity | null;
  onChange: (quantity: EarlyAccessQuantity) => void;
  disabled?: boolean;
  testId?: string;
}

function unitLabel(quantity: EarlyAccessQuantity): string {
  return quantity === 1 ? "1 research unit" : `${quantity} research units`;
}

/**
 * Presentation only. A native radiogroup, the same pattern the payment
 * selector uses, so keyboard and screen reader behavior is the browser's.
 *
 * This component never prices a quantity, never reserves stock, and never
 * submits. It reports a choice to the caller and nothing else.
 */
export function EarlyAccessQuantitySelector({
  value,
  onChange,
  disabled = false,
  testId = "early-access-quantity-selector",
}: EarlyAccessQuantitySelectorProps) {
  const baseId = useId();
  const noteId = `${baseId}-note`;
  const groupName = `${baseId}-quantity`;
  // A value the round does not offer selects nothing rather than being
  // rounded into the nearest offered quantity.
  const selected = isEarlyAccessQuantity(value) ? value : null;

  return (
    <fieldset
      className="grid min-w-0 gap-4 border-0 p-0"
      aria-describedby={noteId}
      disabled={disabled}
      data-testid={testId}
    >
      <legend className="body-m font-700">Choose how many units</legend>
      <p id={noteId} className="body-s text-ink-2 max-w-[62ch]">
        Early access is limited to three units per person. Choosing a quantity
        does not reserve stock, set a price, or place an order.
      </p>

      <div
        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3"
        data-testid={`${testId}-options`}
      >
        {EARLY_ACCESS_QUANTITIES.map((quantity) => {
          const inputId = `${baseId}-${quantity}`;
          const isSelected = selected === quantity;
          return (
            <label
              key={quantity}
              htmlFor={inputId}
              className={`ra-select-card min-w-0 break-words ${
                isSelected ? "ra-select-card-on" : ""
              }`}
              data-testid={`${testId}-option-${quantity}`}
            >
              <input
                id={inputId}
                name={groupName}
                type="radio"
                value={String(quantity)}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onChange(quantity)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--pulse)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pulse)]"
              />
              <span className="body-m font-700 min-w-0 break-words">
                {unitLabel(quantity)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default EarlyAccessQuantitySelector;
