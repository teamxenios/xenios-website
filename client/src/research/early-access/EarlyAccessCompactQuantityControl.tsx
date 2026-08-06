import { useId } from "react";

import {
  EARLY_ACCESS_QUANTITIES,
  isEarlyAccessQuantity,
  type EarlyAccessQuantity,
} from "./EarlyAccessQuantitySelector";

/**
 * The compact quantity control for a catalogue card.
 *
 * THE SAME QUANTITY MODEL, presented smaller. The allowed quantities are
 * imported from EarlyAccessQuantitySelector, which stays the single authority
 * on what this round offers. This control cannot produce a value that module
 * does not name, so the two presentations cannot drift apart on what may be
 * chosen; only on how it looks.
 *
 * Like the radiogroup it stands beside, this component prices nothing,
 * reserves nothing, and submits nothing. It reports a choice to the caller.
 *
 * A null value DISPLAYS as the minimum quantity, because that is what the Add
 * action will use, and a control that shows an empty box beside an Add button
 * invites an order of nothing. It still reports upward only when the customer
 * actually presses a button.
 */

const MIN_QUANTITY = EARLY_ACCESS_QUANTITIES[0];
const MAX_QUANTITY = EARLY_ACCESS_QUANTITIES[EARLY_ACCESS_QUANTITIES.length - 1];

export interface EarlyAccessCompactQuantityControlProps {
  /** The caller's current choice. Null renders as the minimum quantity. */
  value: EarlyAccessQuantity | null;
  onChange(quantity: EarlyAccessQuantity): void;
  /**
   * Names the product in the accessible labels, so a screen reader hears
   * which product's quantity a button steps rather than eighteen identical
   * buttons. The name comes from the server row; nothing here knows one.
   */
  productLabel: string;
  disabled?: boolean;
  testId?: string;
}

export function EarlyAccessCompactQuantityControl({
  value,
  onChange,
  productLabel,
  disabled = false,
  testId = "early-access-compact-quantity",
}: EarlyAccessCompactQuantityControlProps) {
  const baseId = useId();
  const valueId = `${baseId}-value`;
  const effective: EarlyAccessQuantity = isEarlyAccessQuantity(value) ? value : MIN_QUANTITY;

  const decrease = () => {
    const next = effective - 1;
    if (isEarlyAccessQuantity(next)) onChange(next);
  };
  const increase = () => {
    const next = effective + 1;
    if (isEarlyAccessQuantity(next)) onChange(next);
  };

  return (
    <div
      className="flex min-w-0 items-center gap-2"
      data-testid={testId}
      data-quantity={effective}
    >
      {/*
        The decrement is DISABLED at the minimum rather than absent, because a
        control that appears and disappears under the pointer is worse than one
        that is plainly at its floor. The floor itself comes from the offered
        set: the quantity can never step below the minimum or above the
        maximum this round offers.
      */}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={decrease}
        disabled={disabled || effective <= MIN_QUANTITY}
        aria-label={`Decrease quantity, ${productLabel}`}
        data-testid={`${testId}-decrease`}
      >
        <span aria-hidden="true">&minus;</span>
      </button>
      <span
        id={valueId}
        className="body-m font-700 tabular"
        aria-label={`Quantity ${effective}, ${productLabel}`}
        data-testid={`${testId}-value`}
      >
        {effective}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={increase}
        disabled={disabled || effective >= MAX_QUANTITY}
        aria-label={`Increase quantity, ${productLabel}`}
        data-testid={`${testId}-increase`}
      >
        <span aria-hidden="true">+</span>
      </button>
      {/*
        The bundle offer, named at the moment it applies. "20% savings" is the
        offer's NAME, exactly as the quantity radiogroup states it; nothing here
        computes a discount or a total.
      */}
      {effective === MAX_QUANTITY && (
        <span className="body-s text-ink-mute min-w-0" data-testid={`${testId}-bundle`}>
          Research Bundle, 20% savings
        </span>
      )}
    </div>
  );
}

export default EarlyAccessCompactQuantityControl;
