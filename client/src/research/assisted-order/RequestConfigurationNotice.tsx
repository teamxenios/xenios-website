import type { ConfigurationReadState } from "./useInitialRequestConfiguration";

export function RequestConfigurationNotice({ state, disabled, onRetry }: {
  state: ConfigurationReadState;
  disabled: boolean;
  onRetry: () => void;
}) {
  if (state === "ready" || state === "idle") return null;
  return <section className="xenios-order-panel" aria-label="Request options"
    data-testid="request-configuration-notice">
    {state === "loading" ? <p role="status">Loading the current request options. You can keep browsing.</p>
      : <>
        <p role="alert">Current request requirements are unavailable. Submission remains closed. Your selections stay on this page.
          Try again before continuing. No request has been submitted by this action.</p>
        <button type="button" className="xenios-order-button" disabled={disabled} onClick={onRetry}>
          Reload request options
        </button>
        <a className="xenios-order-return-link" href="/research/support">Contact support</a>
      </>}
  </section>;
}
