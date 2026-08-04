import { useId } from "react";
import { ResearchEmptyState } from "../ui/kit";
import { formatCents, PRICE_NOT_CONFIRMED } from "../pages/member/commerce-presentation";

export interface EarlyAccessSummaryLine {
  /** Stable identifier from the server. Used as the React key only. */
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  /** Server-computed. Null means the price is not confirmed yet. */
  readonly unitPriceCents: number | null;
  /** Server-computed. Never derived here from quantity and unit price. */
  readonly lineTotalCents: number | null;
}

export interface EarlyAccessOrderSummaryValue {
  readonly lines: readonly EarlyAccessSummaryLine[];
  /** Server-computed. Never a sum of the lines above. */
  readonly totalCents: number | null;
}

export interface EarlyAccessOrderSummaryProps {
  /** Null until the server has produced a summary. */
  summary: EarlyAccessOrderSummaryValue | null;
  testId?: string;
}

/**
 * Money display only, using the one canonical vocabulary the member pages
 * already share, so the unconfirmed-price wording cannot drift between
 * surfaces. An absent, non-finite, or otherwise unusable figure reads as
 * "Pricing not yet confirmed", never as $0.00 and never as a blank.
 */
function money(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return PRICE_NOT_CONFIRMED;
  return formatCents(cents);
}

/** A quantity is shown only when the server sent a whole, positive count. */
function quantityLabel(quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return `x ${quantity}`;
}

/**
 * Read-only order summary for Private Early Access.
 *
 * Every figure on this panel is the server's. The component performs no
 * arithmetic on money: it does not multiply a quantity by a unit price, does
 * not add lines into a total, and does not fill a missing figure with zero. It
 * renders what it was handed, or says plainly that the number is not confirmed.
 */
export function EarlyAccessOrderSummary({
  summary,
  testId = "early-access-order-summary",
}: EarlyAccessOrderSummaryProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="card min-w-0"
      data-testid={testId}
    >
      <p className="mono-label text-ink-mute">Order summary</p>
      <h2 id={headingId} className="body-l font-700 mt-2 text-balance">
        What you are requesting
      </h2>

      {summary === null || summary.lines.length === 0 ? (
        <div className="mt-3" data-testid={`${testId}-pending`}>
          <ResearchEmptyState
            title="Your summary is not ready yet."
            body="Nothing has been requested or charged. The figures appear here once they are confirmed for your invitation."
          />
        </div>
      ) : (
        <>
          <ul className="mt-4 grid min-w-0 gap-3" data-testid={`${testId}-lines`}>
            {summary.lines.map((line) => {
              const count = quantityLabel(line.quantity);
              return (
                <li
                  key={line.id}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"
                  data-testid={`${testId}-line-${line.id}`}
                >
                  <span className="body-s min-w-0 break-words">
                    {line.label}
                    {count ? <span className="text-ink-mute tabular"> {count}</span> : null}
                  </span>
                  <span className="body-s tabular">{money(line.lineTotalCents)}</span>
                  <span className="body-s text-ink-mute w-full min-w-0 break-words">
                    Unit price {money(line.unitPriceCents)}
                  </span>
                </li>
              );
            })}
          </ul>

          <dl
            className="mt-4 grid min-w-0 gap-2"
            style={{
              borderTop: "1px solid var(--ra-border)",
              paddingTop: 12,
            }}
            data-testid={`${testId}-total`}
          >
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <dt className="body-m font-700">Total</dt>
              <dd className="body-m font-700 tabular">{money(summary.totalCents)}</dd>
            </div>
          </dl>

          <p className="body-s text-ink-mute mt-3 max-w-[62ch]">
            Every figure here is computed and confirmed by Xenios. This page
            does not calculate prices, and nothing is charged from it.
          </p>
        </>
      )}
    </section>
  );
}

export default EarlyAccessOrderSummary;
