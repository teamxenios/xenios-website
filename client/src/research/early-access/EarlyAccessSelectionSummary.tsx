import { useId } from "react";

import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";

/**
 * The compact running summary of what the customer has selected so far.
 *
 * This exists so that a customer eighteen cards deep never has to scroll to
 * the end of the shelf to find out where they stand or where the next action
 * is. It is NOT the order summary: the server-computed order summary, with the
 * bundle discount and the payable total, appears on the order review exactly as
 * before (EarlyAccessOrderSummary), and nothing here replaces or contradicts it.
 *
 * WHAT THE SUBTOTAL IS, PRECISELY. It is the sum of the server-approved
 * single-unit prices already shown on the cards, multiplied by the quantities
 * the customer chose, and it is LABELLED an estimate before savings. It uses no
 * price the server did not send and it never claims to be the amount charged;
 * the bundle discount and the final total remain the server's alone to compute
 * and to state at review. If the selection ever carried mixed currencies, no
 * figure is shown at all rather than a sum across currencies.
 */

export interface EarlyAccessSelectionLine {
  readonly variantId: string;
  readonly name: string;
  readonly strength: string;
  readonly quantity: EarlyAccessQuantity;
  /** The server-approved single-unit price, exactly as shown on the card. */
  readonly unitPriceCents: number;
  readonly currency: string;
}

export interface EarlyAccessSelectionSummaryProps {
  lines: readonly EarlyAccessSelectionLine[];
  /** Takes the customer to the next step of the journey. */
  onReview(): void;
  testId?: string;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

export function EarlyAccessSelectionSummary({
  lines,
  onReview,
  testId = "early-access-selection-summary",
}: EarlyAccessSelectionSummaryProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  const unitCount = lines.reduce((total, line) => total + line.quantity, 0);
  const currencies = new Set(lines.map((line) => line.currency));
  const singleCurrency = currencies.size === 1 ? Array.from(currencies)[0] : null;
  const subtotalCents =
    singleCurrency === null
      ? null
      : lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);

  return (
    <section
      aria-labelledby={headingId}
      className="card min-w-0"
      data-testid={testId}
      data-selected-count={lines.length}
    >
      <p className="mono-label text-ink-mute" id={headingId}>
        Your selection
      </p>

      {lines.length === 0 ? (
        <p className="body-s text-ink-2 mt-2" data-testid={`${testId}-empty`}>
          Nothing selected yet. Add a product to build your order. Nothing has been ordered or
          charged.
        </p>
      ) : (
        <>
          <p
            role="status"
            aria-live="polite"
            className="body-s text-ink-2 mt-2"
            data-testid={`${testId}-count`}
          >
            {lines.length} {lines.length === 1 ? "product" : "products"}, {unitCount}{" "}
            {unitCount === 1 ? "unit" : "units"} selected.
          </p>

          <ul className="mt-3 grid min-w-0 gap-1" data-testid={`${testId}-lines`}>
            {lines.map((line) => (
              <li
                key={line.variantId}
                className="body-s text-ink-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3"
                data-testid={`${testId}-line-${line.variantId}`}
              >
                <span className="min-w-0 break-words">
                  {line.name} {line.strength}
                </span>
                <span className="tabular text-ink-mute">
                  {line.quantity} x {formatAmount(line.unitPriceCents, line.currency)}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="mt-3 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3"
            style={{ borderTop: "1px solid var(--rule)", paddingTop: 10 }}
          >
            <p className="body-s font-700">Estimated subtotal</p>
            <p className="body-m font-700 tabular" data-testid={`${testId}-subtotal`}>
              {subtotalCents === null ? "Confirmed at review" : formatAmount(subtotalCents, singleCurrency ?? "USD")}
            </p>
          </div>
          <p className="body-s text-ink-mute mt-1 max-w-[38ch]" data-testid={`${testId}-note`}>
            Before bundle savings. The final total is computed and confirmed by Xenios at review.
            Nothing is ordered or charged from this panel.
          </p>
        </>
      )}

      <div className="mt-4">
        {lines.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onReview}
            data-testid={`${testId}-review`}
          >
            Review order
          </button>
        )}
      </div>
    </section>
  );
}

export default EarlyAccessSelectionSummary;
