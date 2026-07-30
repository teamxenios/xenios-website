import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The Research section had NO error boundary anywhere in the tree, and neither
 * did the app above it. React unmounts the entire tree on an uncaught render
 * error, so a single bad field on one page, or a lazy() chunk that fails to
 * load on a flaky connection, produced a completely blank white page across all
 * 95 research routes with no way back except a manual URL edit.
 *
 * That is the exact outcome the founder directive forbids: "The user never sees
 * a blank page, generic crash, false success..." (master directive section 2).
 *
 * Scope note: this deliberately wraps the RESEARCH section rather than the app
 * root. Wrapping the root means editing client/src/App.tsx, which the core-site
 * protection manifest lists as a permitted seam file for route registration
 * only, and which therefore needs an exclusive lease from the release owner. An
 * app-wide boundary is still worth adding and is recorded as a separate item;
 * this one covers every route under /research today without touching a
 * lease-gated file.
 */

type Props = {
  children: ReactNode;
  /** Changes to this value reset the boundary. Pass the current location. */
  resetKey?: string;
};

type State = { error: Error | null };

export default class ResearchErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Without this, a caught error traps the visitor forever: React keeps the
    // fallback mounted, so navigating to a working page still shows the error
    // screen. Resetting on the location change makes "go somewhere else" work,
    // which is the recovery route most people reach for before reloading.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only, and deliberately no payload: this runs on the client, and
    // a research page's props can carry member data. Never widen this to log
    // component props or state.
    console.error("[research] render error:", error.message, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "4rem" }}>
        <p className="mono-cap text-ink-mute mb-6">xenios research</p>
        <h1 className="display-m text-balance">This page did not load.</h1>
        <p className="body-m text-ink-mute" style={{ maxWidth: "38rem", marginTop: "1rem" }}>
          Something went wrong while rendering this page. Your account and your data are unaffected,
          and nothing you submitted was lost.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            data-testid="button-research-error-reload"
          >
            Reload this page
          </button>
          <a href="/research" className="btn btn-secondary" data-testid="link-research-error-home">
            Back to the gateway
          </a>
        </div>
        <p className="body-s text-ink-mute" style={{ marginTop: "2rem" }}>
          If this keeps happening, contact{" "}
          <a href="mailto:research@xeniostechnology.com" className="hover:text-pulse transition-colors">
            research@xeniostechnology.com
          </a>
          .
        </p>
      </div>
    );
  }
}
