import { useId } from "react";

/** The only quantities this early access round offers. */
export const EARLY_ACCESS_QUANTITIES = [1, 2, 3] as const;

export type EarlyAccessQuantity = (typeof EARLY_ACCESS_QUANTITIES)[number];

export function isEarlyAccessQuantity(value: unknown): value is EarlyAccessQuantity {
  return (EARLY_ACCESS_QUANTITIES as readonly unknown[]).includes(value);
}

export interface EarlyAccessQuantitySelectorProps {
  /** The caller's current choice. Anything outside the offered set selects nothing. */
  value: EarlyAccessQuantity | null;
  onChange: (quantity: EarlyAccessQuantity) => void;
  disabled?: boolean;
  testId?: string;
}

/**
 * How many units, chosen inside a catalogue card.
 *
 * WHY THIS IS THREE SMALL CHIPS AND NOT THREE COLUMNS OF PROSE.
 *
 * This control lives inside a product card in a multi-column grid. The
 * previous version laid its options out with `sm:grid-cols-3`, and that broke
 * in production for a structural reason worth stating plainly: a Tailwind
 * breakpoint asks how wide the VIEWPORT is, never how wide the CARD is. On a
 * 1440px desktop the `sm:` rule was satisfied, so three columns were forced
 * inside a card roughly 300px wide. Each option got about 85px, of which the
 * radio and padding took most, and "3-Unit Research Bundle — 20% savings"
 * wrapped one character per line.
 *
 * The fix is to stop asking a narrow card to hold three columns of text. The
 * number is the choice, so the number is the chip; the bundle offer is a fact
 * about the round, so it is stated once underneath in a full-width line that
 * has the whole card to wrap in. This reads at every width without a
 * container query, and it is the same control everywhere so there is still
 * ONE quantity model in the flow.
 *
 * It prices nothing. "20% savings" is the NAME of the offer, exactly as the
 * founder release states it; the discount and the payable total are computed
 * by the server and shown on the order review.
 */
export function EarlyAccessQuantitySelector({
  value,
  onChange,
  disabled = false,
  testId = "early-access-quantity-selector",
}: EarlyAccessQuantitySelectorProps) {
  const baseId = useId();
  const noteId = `${baseId}-note`;
  const groupName = `${baseId}-quantity`;
  // A value the round does not offer selects nothing rather than being
  // rounded into the nearest offered quantity.
  const selected = isEarlyAccessQuantity(value) ? value : null;

  return (
    <fieldset
      className="grid min-w-0 gap-1.5 border-0 p-0"
      aria-describedby={noteId}
      disabled={disabled}
      data-testid={testId}
    >
      <legend className="body-xs text-ink-mute">How many units</legend>

      <div className="flex min-w-0 flex-wrap gap-1.5" data-testid={`${testId}-options`}>
        {EARLY_ACCESS_QUANTITIES.map((quantity) => {
          const inputId = `${baseId}-${quantity}`;
          const isSelected = selected === quantity;
          return (
            <label
              key={quantity}
              htmlFor={inputId}
              className="body-s inline-flex min-w-0 cursor-pointer items-center justify-center font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--pulse)]"
              // Styled here rather than in a stylesheet class on purpose. The
              // shared `ra-*` component classes resolve their colors from
              // `--ra-*` variables declared on `.research-app`, and this route
              // does not mount inside that wrapper, so those borders come out
              // invalid and invisible. These three tokens are declared on
              // :root, so the chip looks the same wherever it is rendered.
              style={{
                minWidth: 44,
                minHeight: 40,
                padding: "6px 14px",
                borderRadius: 4,
                border: `1px solid ${isSelected ? "var(--pulse)" : "var(--rule)"}`,
                background: isSelected
                  ? "color-mix(in srgb, var(--pulse) 8%, var(--paper))"
                  : "var(--paper)",
                color: isSelected ? "var(--pulse)" : "inherit",
                opacity: disabled ? 0.5 : 1,
              }}
              data-selected={isSelected ? "true" : "false"}
              data-testid={`${testId}-option-${quantity}`}
            >
              {/*
                A real radio, visually replaced by the chip rather than
                removed: Tab reaches it, arrow keys move between options,
                Space selects, and a screen reader announces the group and the
                choice. `sr-only` keeps it in the accessibility tree, which
                `display: none` would not.
              */}
              <input
                id={inputId}
                name={groupName}
                type="radio"
                value={String(quantity)}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onChange(quantity)}
                className="sr-only"
              />
              <span aria-hidden="true">{quantity}</span>
              <span className="sr-only">
                {quantity === 1 ? "1 research unit" : `${quantity} research units`}
              </span>
            </label>
          );
        })}
      </div>

      {/*
        The offer, once, full width. It has the whole card to wrap in, so it
        reads as a sentence at every card width instead of a column of
        letters.
      */}
      <p id={noteId} className="body-xs text-ink-mute min-w-0">
        3 units is the Research Bundle, 20% savings. Limit 3 per person.
      </p>
    </fieldset>
  );
}

export default EarlyAccessQuantitySelector;
