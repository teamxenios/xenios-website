/**
 * The compact selection bar, so a customer never scrolls 22 products to find
 * the next action.
 *
 * IT SHOWS NO MONEY, AND THAT IS DELIBERATE.
 *
 * A subtotal here would have to be built in the browser by multiplying a unit
 * price by a quantity and summing the results. `EarlyAccessOrderSummary` states
 * the rule this codebase already settled on: it "performs no arithmetic on
 * money: it does not multiply a quantity by a unit price, does not add lines
 * into a total, and does not fill a missing figure with zero." The Research
 * Bundle discount and the payable total are server-computed, so any figure
 * assembled here would be a second pricing runtime whose first disagreement
 * with the server shows a customer a number we do not honour.
 *
 * So this bar counts what is selected and offers the next step. The money
 * appears on the order summary, from the server, or is stated as not yet
 * confirmed. A count is a fact the browser genuinely knows.
 */

export interface EarlyAccessSelectionBarProps {
  /** How many distinct units are selected. */
  selectedCount: number;
  /** Total units across the selection, from the quantity selector. */
  unitCount: number;
  onReview(): void;
  testId?: string;
}

export function EarlyAccessSelectionBar({
  selectedCount,
  unitCount,
  onReview,
  testId = "early-access-selection-bar",
}: EarlyAccessSelectionBarProps) {
  // Nothing selected renders nothing at all. An empty bar with a dead button
  // is chrome that teaches the customer to ignore it.
  if (selectedCount < 1) return null;

  return (
    <aside
      data-testid={testId}
      data-selected-count={selectedCount}
      data-unit-count={unitCount}
      className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 p-3"
      style={{
        borderTop: "1px solid var(--ra-border)",
        background: "var(--ra-surface, var(--ra-bg))",
      }}
    >
      <p className="body-s min-w-0 font-medium" data-testid={`${testId}-count`}>
        {selectedCount} {selectedCount === 1 ? "product" : "products"} selected
        <span className="text-ink-mute">
          {" "}
          ({unitCount} {unitCount === 1 ? "unit" : "units"})
        </span>
      </p>

      <button
        type="button"
        onClick={onReview}
        data-testid={`${testId}-review`}
        className="btn btn-primary"
      >
        Review order
      </button>
    </aside>
  );
}

export default EarlyAccessSelectionBar;
