import { useId } from "react";

export interface EarlyAccessStepperProps {
  /** Ordered step labels supplied by the caller. This component owns no flow. */
  steps: readonly string[];
  /** Zero-based index of the step the caller says is active. */
  activeIndex: number;
  testId?: string;
}

/**
 * Presentational step indicator for the Private Early Access flow.
 *
 * It reports where the caller says the flow is. It never advances a step,
 * validates a step, reorders the list, or exposes a control. An index outside
 * the supplied range marks nothing current rather than guessing a position.
 */
export function EarlyAccessStepper({
  steps,
  activeIndex,
  testId = "early-access-stepper",
}: EarlyAccessStepperProps) {
  const baseId = useId();
  const statusId = `${baseId}-status`;
  if (steps.length === 0) return null;

  const current =
    Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < steps.length
      ? activeIndex
      : null;

  return (
    <div className="min-w-0" data-testid={testId}>
      <ol
        aria-label="Early access steps"
        aria-describedby={statusId}
        className="grid min-w-0 gap-2"
      >
        {steps.map((label, index) => {
          const isCurrent = index === current;
          return (
            <li
              key={`${index}-${label}`}
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-w-0 flex-wrap items-baseline gap-2"
              data-testid={`${testId}-step-${index}`}
            >
              <span className="mono-label text-ink-mute tabular">{index + 1}</span>
              {/* Position is never signaled by color alone: the active step is
                  bold AND says so in words. */}
              <span
                className={`body-s min-w-0 break-words ${isCurrent ? "font-700" : "text-ink-2"}`}
              >
                {label}
                {isCurrent ? " (you are here)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className="body-s text-ink-mute mt-3"
      >
        {current === null
          ? `${steps.length} steps in this flow.`
          : `Step ${current + 1} of ${steps.length}: ${steps[current]}.`}
      </p>
    </div>
  );
}

export default EarlyAccessStepper;
