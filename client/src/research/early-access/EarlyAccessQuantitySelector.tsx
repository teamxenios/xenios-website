import { useId, useState } from "react";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
  isEarlyAccessQuantity,
} from "@shared/research/early-access-quantity";

/** The band this round offers, from the one policy. Never restated here. */
export const EARLY_ACCESS_QUANTITY_MIN = EARLY_ACCESS_MIN_QUANTITY;
export const EARLY_ACCESS_QUANTITY_MAX = EARLY_ACCESS_MAX_QUANTITY;

/**
 * A quantity this round accepts.
 *
 * This was a union of the three literals the round used to offer. At a broad
 * band it is a plain number with a guard, because a large literal union buys
 * nothing the runtime check does not already give and forces a cast at every
 * call site that computes a quantity rather than picking one.
 */
export type EarlyAccessQuantity = number;

export { isEarlyAccessQuantity };

export interface EarlyAccessQuantitySelectorProps {
  /** The caller's current choice. Anything outside the band shows as empty. */
  value: EarlyAccessQuantity | null;
  onChange: (quantity: EarlyAccessQuantity) => void;
  /** A narrower server-projected authority ceiling for this exact unit. */
  maxQuantity?: EarlyAccessQuantity;
  disabled?: boolean;
  testId?: string;
}

/**
 * How many units, chosen inside a catalogue card.
 *
 * WHY THIS IS A STEPPER AND NOT CHIPS ANY MORE.
 *
 * It was three chips, for a good reason that has now expired. The reason is
 * worth keeping written down because it constrains the replacement: this
 * control lives inside a product card in a multi-column grid, and a Tailwind
 * breakpoint asks how wide the VIEWPORT is, never how wide the CARD is. An
 * earlier version laid the options out with `sm:grid-cols-3`, which was
 * satisfied on a 1440px desktop and so forced three columns inside a card
 * roughly 300px wide, wrapping one character per line. Chips fixed that by
 * making the number itself the control.
 *
 * Fifty chips would reintroduce the same failure by a different route: a
 * fifty-item wrap flow is taller than the card it sits in and turns a product
 * grid into a wall of digits. A stepper is a fixed-size control at every width,
 * which is the property the card actually needs, and it is the standard way to
 * express a wide numeric range on a phone.
 *
 * THE MAX HERE IS A COURTESY, NOT A CHECK. The input's max attribute stops a
 * pointer, and the clamp below stops a keyboard, but neither is authority.
 * Every quantity is re-read on the server against the same policy before it can
 * reach a quote, an order or a supplier release.
 *
 * It prices nothing. The line total is whatever the server returns on the order
 * review; this control does not multiply anything by anything.
 */
export function EarlyAccessQuantitySelector({
  value,
  onChange,
  maxQuantity = EARLY_ACCESS_QUANTITY_MAX,
  disabled = false,
  testId = "early-access-quantity-selector",
}: EarlyAccessQuantitySelectorProps) {
  const baseId = useId();
  const noteId = `${baseId}-note`;
  const inputId = `${baseId}-quantity`;
  const effectiveMax = isEarlyAccessQuantity(maxQuantity)
    ? maxQuantity
    : EARLY_ACCESS_QUANTITY_MIN;

  // A value the round does not offer selects nothing rather than being rounded
  // into the nearest legal quantity.
  const selected = isEarlyAccessQuantity(value) && value <= effectiveMax ? value : null;

  // What the person is typing, which is allowed to be transiently empty or
  // out of band while they type. It is never what gets reported: `commit`
  // below only ever emits a quantity the policy accepts.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (selected === null ? "" : String(selected));

  function commit(candidate: number): void {
    // Clamped rather than refused, because a stepper's job is to stay inside
    // its own band. A typed 51 becomes 50 here AND is refused by the server if
    // it ever arrives by another route.
    const clamped = Math.min(
      effectiveMax,
      Math.max(EARLY_ACCESS_QUANTITY_MIN, Math.trunc(candidate)),
    );
    if (!isEarlyAccessQuantity(clamped)) return;
    setDraft(null);
    onChange(clamped);
  }

  const current = selected ?? EARLY_ACCESS_QUANTITY_MIN;
  const atMin = current <= EARLY_ACCESS_QUANTITY_MIN;
  const atMax = current >= effectiveMax;

  const stepStyle = (blocked: boolean) => ({
    minWidth: 44,
    minHeight: 44,
    borderRadius: 4,
    border: `1px solid var(--rule)`,
    background: "var(--paper)",
    opacity: disabled || blocked ? 0.5 : 1,
    cursor: disabled || blocked ? "not-allowed" : "pointer",
  });

  return (
    <fieldset
      className="grid min-w-0 gap-1.5 border-0 p-0"
      aria-describedby={noteId}
      disabled={disabled}
      data-testid={testId}
    >
      <legend className="body-xs text-ink-mute">How many units</legend>

      <div className="flex min-w-0 items-center gap-1.5" data-testid={`${testId}-stepper`}>
        <button
          type="button"
          onClick={() => commit(current - 1)}
          disabled={disabled || atMin}
          aria-label="One fewer unit"
          aria-controls={inputId}
          className="body-m inline-flex min-w-0 items-center justify-center font-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pulse)]"
          // Styled inline rather than through the shared `ra-*` classes: those
          // resolve their colors from `--ra-*` variables declared on
          // `.research-app`, and this route does not mount inside that wrapper,
          // so those borders come out invalid and invisible. The tokens used
          // here are declared on :root and render the same wherever this sits.
          style={stepStyle(atMin)}
          data-testid={`${testId}-decrement`}
        >
          <span aria-hidden="true">-</span>
        </button>

        {/*
          A real number input, so a phone shows a numeric keypad and a keyboard
          user can type 17 instead of pressing plus fourteen times. `max` is
          declared for assistive technology and for pointer stepping; the clamp
          in `commit` is what actually holds, because an attribute is not a
          check.
        */}
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={EARLY_ACCESS_QUANTITY_MIN}
          max={effectiveMax}
          step={1}
          value={shown}
          disabled={disabled}
          aria-label="Number of research units"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (Number.isNaN(parsed)) {
              // An emptied field returns to the last good value rather than
              // reporting a quantity nobody chose.
              setDraft(null);
              return;
            }
            commit(parsed);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="body-s min-w-0 text-center font-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pulse)]"
          style={{
            width: 64,
            minHeight: 44,
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            opacity: disabled ? 0.5 : 1,
          }}
          data-testid={`${testId}-input`}
        />

        <button
          type="button"
          onClick={() => commit(current + 1)}
          disabled={disabled || atMax}
          aria-label="One more unit"
          aria-controls={inputId}
          className="body-m inline-flex min-w-0 items-center justify-center font-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pulse)]"
          style={stepStyle(atMax)}
          data-testid={`${testId}-increment`}
        >
          <span aria-hidden="true">+</span>
        </button>

        {/*
          The current choice in words, for a screen reader, since the visible
          number alone does not say what it counts.
        */}
        <span className="sr-only" data-testid={`${testId}-announced`}>
          {selected === null
            ? "No quantity chosen"
            : selected === 1
              ? "1 research unit"
              : `${selected} research units`}
        </span>
      </div>

      {/*
        The offer and the limit, once, full width. It has the whole card to wrap
        in, so it reads as a sentence at every card width.
      */}
      <p id={noteId} className="body-xs text-ink-mute min-w-0">
        3 units is the Research Bundle, 20% savings. Limit {effectiveMax} per
        product.
      </p>
    </fieldset>
  );
}

export default EarlyAccessQuantitySelector;
