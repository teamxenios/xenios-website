import { money } from "./wizard-state";

/**
 * The estimated-total row on the order-request page and its confirmation.
 *
 * With no catalog-derived estimate, as under quote-only Early Access, the row
 * is absent: "Estimated priced total: Price on request" tells a customer
 * nothing and reads as if a total were coming.
 */
export function OrderEstimateRow({
  estimate,
  variant,
  testId,
}: {
  estimate: number | null;
  variant: "summary" | "facts";
  testId?: string;
}) {
  if (estimate === null) return null;
  if (variant === "facts") {
    return <div><dt>Estimated priced total</dt><dd data-testid={testId}>{money(estimate)}</dd></div>;
  }
  return (
    <div className="xenios-order-total"><span>Estimated priced total</span><strong data-testid={testId}>{money(estimate)}</strong></div>
  );
}

export default OrderEstimateRow;
