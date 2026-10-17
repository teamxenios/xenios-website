import { Component, type ErrorInfo, type ReactNode } from "react";

// Every routed surface is React.lazy code-split behind Suspense. Suspense
// handles the WAIT; it does not handle a THROW. Without a boundary, a failed
// chunk fetch (a deploy that replaced the hashed asset mid-session is the
// common one) or any render error unmounts the whole tree and the visitor is
// left looking at a blank document with nothing to click.
//
// This boundary is deliberately plain: no router hook, no data fetch, no
// context. A boundary that depends on the thing that just broke is a boundary
// that breaks with it. Recovery is a full reload rather than a state reset,
// because the common cause is a stale chunk that only a fresh document fixes.

interface Props {
  children: ReactNode;
  /** Overrides the reload action; used by tests to observe the recovery path. */
  onReload?: () => void;
}

interface State {
  failed: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only. No error-reporting service is configured, and this must
    // never carry member, admin, or Care content off the page.
    console.error("[route error boundary]", error, info.componentStack);
  }

  private reload = (): void => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main
        className="container-x"
        style={{ paddingTop: "var(--space-hero-top)", paddingBottom: 64 }}
        data-testid="route-error-boundary"
      >
        <p className="mono-cap text-ink-mute">Something went wrong</p>
        <h1 className="display-s mt-3" style={{ maxWidth: "22ch" }}>
          This page did not finish loading.
        </h1>
        <p className="body-s text-ink-2 mt-4" style={{ maxWidth: "60ch" }}>
          Reloading usually fixes it, and it most often happens when the site was
          updated while this tab was open. Nothing you did caused this, and
          nothing you submitted has been lost.
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            type="button"
            className="btn btn-primary"
            onClick={this.reload}
            data-testid="button-error-reload"
          >
            Reload the page
          </button>
          <a href="/" className="btn btn-secondary" data-testid="link-error-home">
            Go to the homepage
          </a>
        </div>
      </main>
    );
  }
}

export default RouteErrorBoundary;
