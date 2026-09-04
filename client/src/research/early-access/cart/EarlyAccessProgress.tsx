import {
  EARLY_ACCESS_CUSTOMER_STEPS,
  earlyAccessCustomerStepIndex,
} from "../customerSteps";
import type { EarlyAccessCheckoutStep } from "./history";

/**
 * The step indicator.
 *
 * This is deliberately a four-stage customer projection. The internal route
 * remains the existing eight-state machine; this component only translates
 * the current state into the simpler stage the customer sees.
 *
 * ONE PLACE SAYS WHERE THE CUSTOMER IS. The "Step N of 4" line is not decoration
 * for the boxes below it; it is the accessible answer, and it is present at
 * every width. The boxes are the same information drawn for people who are
 * looking rather than listening, so they are `aria-hidden` and the screen
 * reader hears the sentence once instead of once per drawn chip.
 *
 * At narrow widths the boxes scroll horizontally inside their own track and
 * the page body never scrolls sideways.
 */
export function EarlyAccessProgress({
  step,
  onBack,
}: Readonly<{ step: EarlyAccessCheckoutStep; onBack?: () => void }>) {
  const index = earlyAccessCustomerStepIndex(step);
  const current = EARLY_ACCESS_CUSTOMER_STEPS[index];

  return (
    <nav aria-label="Early Access checkout progress" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label text-ink-mute" data-testid="early-access-progress-position">
          Step {index + 1} of {EARLY_ACCESS_CUSTOMER_STEPS.length} · {current.label}
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
        {EARLY_ACCESS_CUSTOMER_STEPS.map((entry, position) => (
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
