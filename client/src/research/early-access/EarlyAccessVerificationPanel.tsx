import { useCallback, useId, useState } from "react";

import type {
  EarlyAccessVerificationRequestResult,
  EarlyAccessVerifyResult,
} from "../adapters/earlyAccessAgreement";

/**
 * Identity verification, using the doors that already exist.
 *
 * WHY THIS EXISTS
 *
 * Unlocking with the shared access password proves someone was invited. It does
 * NOT say who they are, and the server is deliberately strict about that: with
 * no approved customer bound to the session, the catalogue grants no audience,
 * so nothing carries a price and nothing can be ordered, and the agreement has
 * nobody to be recorded for.
 *
 * The two routes that fix this have been mounted the whole time and no screen
 * ever offered them. That gap is what a customer met in production as a
 * catalogue where every unit said "not available to order" with no explanation.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not decide identity, and it cannot. The request door answers the same
 * 202 whether or not the email names an approved customer, so this panel says
 * the same thing either way rather than rebuilding the oracle the server
 * refuses to be. The token is minted against one customer AND one session and
 * is single use, so a token pasted into another session binds nobody. Nothing
 * here is remembered by the browser.
 */

export interface EarlyAccessVerificationPanelProps {
  onRequest: (email: string) => Promise<EarlyAccessVerificationRequestResult>;
  onRedeem: (token: string) => Promise<EarlyAccessVerifyResult>;
  /** Called only when the SERVER confirms the binding. */
  onVerified: () => void;
  testId?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "requested" }
  | { kind: "redeeming" }
  | { kind: "refused" }
  | { kind: "fault"; message: string };

export function EarlyAccessVerificationPanel({
  onRequest,
  onRedeem,
  onVerified,
  testId = "early-access-verification",
}: EarlyAccessVerificationPanelProps) {
  const emailId = useId();
  const tokenId = useId();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const request = useCallback(() => {
    setStatus({ kind: "sending" });
    void onRequest(email.trim()).then((result) => {
      if (result.kind === "requested") {
        setStatus({ kind: "requested" });
        return;
      }
      setStatus({
        kind: "fault",
        message:
          result.kind === "locked"
            ? "Your private session has ended. Unlock again to continue."
            : result.message,
      });
    });
  }, [email, onRequest]);

  const redeem = useCallback(() => {
    setStatus({ kind: "redeeming" });
    void onRedeem(token.trim()).then((result) => {
      if (result.kind === "verified") {
        onVerified();
        return;
      }
      if (result.kind === "refused") {
        // Deliberately one message. The server does not say whether the token
        // was wrong, expired, already used, or minted for another session, and
        // neither does this.
        setStatus({ kind: "refused" });
        return;
      }
      setStatus({
        kind: "fault",
        message:
          result.kind === "locked"
            ? "Your private session has ended. Unlock again to continue."
            : result.message,
      });
    });
  }, [onRedeem, onVerified, token]);

  const busy = status.kind === "sending" || status.kind === "redeeming";

  return (
    <div className="grid gap-5 min-w-0" data-testid={testId} data-status={status.kind}>
      <div className="grid gap-2 min-w-0">
        <label className="body-s text-ink-2" htmlFor={emailId}>
          The email address your Early Access account was approved under
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          className="input-field"
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
          data-testid={`${testId}-email`}
        />
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || email.trim().length === 0}
            onClick={request}
            data-testid={`${testId}-request`}
          >
            {status.kind === "sending" ? "Requesting" : "Request a verification link"}
          </button>
        </div>
        {status.kind === "requested" && (
          <p
            aria-live="polite"
            role="status"
            className="body-s text-ink-2 max-w-[62ch]"
            data-testid={`${testId}-requested`}
          >
            If that address is an approved Early Access account, a verification link is on its way
            from your access contact. Paste the code below when it arrives.
          </p>
        )}
      </div>

      <div className="grid gap-2 min-w-0">
        <label className="body-s text-ink-2" htmlFor={tokenId}>
          Verification code
        </label>
        <input
          id={tokenId}
          type="text"
          autoComplete="one-time-code"
          className="input-field"
          value={token}
          disabled={busy}
          onChange={(event) => setToken(event.target.value)}
          data-testid={`${testId}-token`}
        />
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || token.trim().length === 0}
            onClick={redeem}
            data-testid={`${testId}-redeem`}
          >
            {status.kind === "redeeming" ? "Verifying" : "Verify my identity"}
          </button>
        </div>
      </div>

      {status.kind === "refused" && (
        <p
          aria-live="polite"
          role="status"
          className="body-s text-ink-2 max-w-[62ch]"
          data-testid={`${testId}-refused`}
        >
          That code was not accepted. Codes can only be used once, and only in the session they
          were sent for. Request a new link and try again. Nothing has been ordered or charged.
        </p>
      )}
      {status.kind === "fault" && (
        <p
          aria-live="polite"
          role="status"
          className="body-s text-ink-2 max-w-[62ch]"
          data-testid={`${testId}-fault`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
