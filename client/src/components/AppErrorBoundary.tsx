import { Component, createRef, type ErrorInfo, type ReactNode } from "react";

const ERROR_TITLE = "Page unavailable, xenios";
const ERROR_ROBOTS = "noindex, nofollow";

export function markFailedDocumentNoIndex(targetDocument: Document): void {
  targetDocument.title = ERROR_TITLE;

  let robots = targetDocument.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) {
    robots = targetDocument.createElement("meta");
    robots.name = "robots";
    targetDocument.head.appendChild(robots);
  }
  robots.content = ERROR_ROBOTS;

  targetDocument.head
    .querySelectorAll('link[rel="canonical"], link[rel="alternate"]')
    .forEach((link) => link.remove());
}

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  failed: boolean;
};

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false };
  private readonly fallback = createRef<HTMLElement>();

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Do not render, persist, or transmit the exception text: route failures
    // can contain URLs or runtime context. Lead-owned observability may report
    // an allowlisted category separately when this boundary is composed.
    markFailedDocumentNoIndex(document);
    this.fallback.current?.focus();
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main
        id="site-error"
        ref={this.fallback}
        tabIndex={-1}
        className="container-x section-y"
        data-testid="app-error-boundary"
      >
        <section aria-labelledby="site-error-title" className="card max-w-[720px] mx-auto">
          <p className="mono-cap text-ink-mute mb-4">PAGE UNAVAILABLE</p>
          <h1 id="site-error-title" className="display-m text-balance">
            This page could not be displayed.
          </h1>
          <p className="body-l text-ink-2 mt-6 max-w-[54ch]">
            Reload the page to try again. If the problem continues, return to the xenios home page.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <a href="/" className="btn btn-secondary">
              Return home
            </a>
          </div>
        </section>
      </main>
    );
  }
}
