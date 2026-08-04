import { useId } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

/** The referral code is a short human string, never a document. */
export const EARLY_ACCESS_REFERRAL_MAX_LENGTH = 80;

export interface EarlyAccessReferralFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testId?: string;
}

/**
 * Leading whitespace is dropped as it is typed and the value is capped at the
 * maximum length, so a paste cannot exceed it. Trailing whitespace is only
 * removed on blur: trimming both ends on every keystroke would swallow the
 * space in a referred-by name such as "Jane Smith".
 */
function clean(raw: string): string {
  return raw.replace(/^\s+/, "").slice(0, EARLY_ACCESS_REFERRAL_MAX_LENGTH);
}

/**
 * Presentation only. An optional, fully controlled referral field.
 *
 * It never submits, never looks a code up, and never decides whether a code is
 * valid. Enter is deliberately swallowed so this optional field can never
 * submit the form it sits in.
 */
export function EarlyAccessReferralField({
  value,
  onChange,
  disabled = false,
  testId = "early-access-referral-field",
}: EarlyAccessReferralFieldProps) {
  const baseId = useId();
  const inputId = `${baseId}-referral`;
  const hintId = `${baseId}-referral-hint`;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(clean(event.target.value));
  }

  function handleBlur() {
    const trimmed = value.trim();
    if (trimmed !== value) onChange(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  return (
    <div className="min-w-0" data-testid={testId}>
      <label htmlFor={inputId} className="mono-label text-ink-mute">
        Referral code or who referred you (optional)
      </label>
      <div className="mt-1">
        <input
          id={inputId}
          type="text"
          className="input-field"
          value={value}
          disabled={disabled}
          maxLength={EARLY_ACCESS_REFERRAL_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          data-testid={`${testId}-input`}
        />
      </div>
      <p id={hintId} className="body-s text-ink-mute mt-2 max-w-[62ch]">
        Leave this empty if nobody referred you. Up to{" "}
        {EARLY_ACCESS_REFERRAL_MAX_LENGTH} characters. A code is checked later
        by a person, so nothing here changes what you are offered right now.
      </p>
    </div>
  );
}

export default EarlyAccessReferralField;
