// The truthful state badge.
//
// Accessibility rules this component exists to hold:
//   - the meaning is carried by WORDS, always. The dot is decorative and
//     aria-hidden, and the border and text colour only reinforce a sentence
//     that is already readable, so nothing is signalled by colour alone;
//   - the badge is plain text, not a control. It never looks tappable, because
//     the availability is a statement, not an action;
//   - it wraps and never sets a fixed width, so it survives 320px and large
//     text zoom.
//
// The words come from describeOfferMode through ./labels, so this component
// cannot invent an availability of its own.

import { offerModeLabel } from "./labels";

export interface OfferModeBadgeProps {
  availability: string;
  /**
   * The accessible prefix, so a screen reader hears "Availability: Request
   * access" rather than a bare fragment. Visible text stays short.
   */
  label?: string;
  className?: string;
  testId?: string;
}

export function OfferModeBadge({
  availability,
  label = "Availability",
  className,
  testId = "offer-mode-badge",
}: OfferModeBadgeProps) {
  const text = offerModeLabel(availability);
  return (
    <span
      data-testid={testId}
      data-availability={String(availability)}
      className={[
        "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 body-s",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
      <span className="sr-only">{`${label}: `}</span>
      <span data-testid={`${testId}-text`} className="min-w-0 break-words">
        {text}
      </span>
    </span>
  );
}
