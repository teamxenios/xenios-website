import { EARLY_ACCESS_CHECKOUT_STEPS, type EarlyAccessCheckoutStep } from "./history";

const LABELS: Readonly<Record<EarlyAccessCheckoutStep, string>> = Object.freeze({
  catalog: "Catalogue",
  cart: "Cart",
  details: "Contact & Shipping",
  agreements: "Agreements",
  review: "Review",
  payment: "Payment",
  submit: "Submit",
  status: "Status",
});

const STEPS: readonly Readonly<{ key: EarlyAccessCheckoutStep; label: string }>[] =
  EARLY_ACCESS_CHECKOUT_STEPS.map((key) => ({ key, label: LABELS[key] }));

/**
 * The step indicator.
 *
 * The list is derived from the journey's own step order rather than repeated
 * here, so a step can never appear in the route and be missing from the
 * progress bar, or sit in a different position in each.
 *
 * ONE PLACE SAYS WHERE THE CUSTOMER IS. The "Step N of 8" line is not decoration
 * for the boxes below it; it is the accessible answer, and it is present at
 * every width. The boxes are the same information drawn for people who are
 * looking rather than listening, so they are `aria-hidden` and the screen
 * reader hears the sentence once instead of nine times.
 *
 * At 390px eight boxes cannot be eight columns without becoming unreadable
 * slivers, so they scroll horizontally inside their own track and the page body
 * never scrolls sideways.
 */
export function EarlyAccessProgress({
  step,
  onBack,
}: Readonly<{ step: EarlyAccessCheckoutStep; onBack?: () => void }>) {
  const index = Math.max(0, STEPS.findIndex((entry) => entry.key === step));
  const current = STEPS[index];

  return (
    <nav aria-label="Early Access checkout progress" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label text-ink-mute" data-testid="early-access-progress-position">
          Step {index + 1} of {STEPS.length} · {current?.label}
        </p>
        {onBack ? (
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        ) : null}
      </div>
      <ol
        aria-hidden="true"
        className="flex min-w-0 gap-2 overflow-x-auto pb-1"
        data-testid="early-access-progress-steps"
      >
        {STEPS.map((entry, position) => (
          <li
            key={entry.key}
            data-step={entry.key}
            data-state={
              position === index ? "current" : position < index ? "done" : "upcoming"
            }
            className={`shrink-0 rounded border px-2 py-2 text-center body-xs ${
              position === index
                ? "border-[var(--pulse)] font-700"
                : "border-[var(--rule)] text-ink-mute"
            }`}
          >
            {entry.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
