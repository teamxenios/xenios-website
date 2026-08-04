import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ResearchSecureNotice } from "../ui/kit";

export interface EarlyAccessUnlockFormProps {
  /** Called with the exact password the person typed, once, on submit. */
  onSubmit: (password: string) => void;
  busy?: boolean;
  /** Server-supplied message. The component never invents a failure reason. */
  error?: string | null;
  /** Server-supplied count. Null or absent means the caller is not telling us. */
  attemptsRemaining?: number | null;
  testId?: string;
}

function attemptsMessage(remaining: number): string {
  if (remaining === 0) {
    return "No attempts remain on this invitation. Contact the person who invited you.";
  }
  if (remaining === 1) {
    return "1 attempt remains before this invitation locks.";
  }
  return `${remaining} attempts remain before this invitation locks.`;
}

/**
 * The Private Early Access password gate, presentation only.
 *
 * The password lives in this component's local state and leaves it exactly
 * once, as the argument to onSubmit. It is never logged, never written to a
 * URL, never trimmed or normalized (that would change the secret), and the
 * input carries no name attribute, so even a native form submission could not
 * serialize it into a query string. Submission is always intercepted, so the
 * browser never navigates.
 *
 * This component does not check the password, hold the attempt budget, or
 * decide access. It shows what the caller was told.
 */
export function EarlyAccessUnlockForm({
  onSubmit,
  busy = false,
  error = null,
  attemptsRemaining = null,
  testId = "early-access-unlock-form",
}: EarlyAccessUnlockFormProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const inputId = `${baseId}-password`;
  const errorId = `${baseId}-error`;
  const attemptsId = `${baseId}-attempts`;
  const [password, setPassword] = useState("");

  // Only a whole, non-negative count is believed. Anything else is treated as
  // "not told", never as a reason to open or close the gate.
  const attempts =
    typeof attemptsRemaining === "number" &&
    Number.isInteger(attemptsRemaining) &&
    attemptsRemaining >= 0
      ? attemptsRemaining
      : null;
  const lockedOut = attempts === 0;
  const message = typeof error === "string" && error.trim().length > 0 ? error : null;
  const blocked = busy || lockedOut || password.length === 0;

  const describedBy = [message ? errorId : null, attempts !== null ? attemptsId : null]
    .filter((id): id is string => id !== null)
    .join(" ");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Always first: an unprevented submit would navigate and put the typed
    // secret in the address bar.
    event.preventDefault();
    if (blocked) return;
    onSubmit(password);
  }

  return (
    <form
      aria-labelledby={headingId}
      className="card grid min-w-0 gap-4"
      onSubmit={handleSubmit}
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="mono-label text-ink-mute">Invitation only</p>
        <h2 id={headingId} className="body-l font-700 mt-2 text-balance">
          Enter your access password
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[62ch]">
          Use the password from your invitation. Nothing is ordered, charged, or
          confirmed by unlocking this page.
        </p>
      </div>

      <div className="min-w-0">
        <label htmlFor={inputId} className="mono-label text-ink-mute">
          Access password
        </label>
        <div className="mt-1">
          <input
            id={inputId}
            type="password"
            className="input-field"
            autoComplete="current-password"
            value={password}
            disabled={busy || lockedOut}
            aria-invalid={message ? true : undefined}
            aria-describedby={describedBy.length > 0 ? describedBy : undefined}
            onChange={(event) => setPassword(event.target.value)}
            data-testid={`${testId}-password`}
          />
        </div>
      </div>

      {message && (
        <p
          id={errorId}
          role="alert"
          className="body-s"
          style={{ color: "var(--error)" }}
          data-testid={`${testId}-error`}
        >
          {message}
        </p>
      )}

      {attempts !== null && (
        <p
          id={attemptsId}
          role="status"
          aria-live="polite"
          className="body-s text-ink-2"
          data-testid={`${testId}-attempts`}
        >
          {attemptsMessage(attempts)}
        </p>
      )}

      <div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={blocked}
          data-testid={`${testId}-submit`}
        >
          {busy ? "Checking..." : "Unlock"}
        </button>
      </div>

      <ResearchSecureNotice>
        Your password is checked once against your invitation. It is never put
        in the address bar, in a link, or in anything this page shares.
      </ResearchSecureNotice>
    </form>
  );
}

export default EarlyAccessUnlockForm;
