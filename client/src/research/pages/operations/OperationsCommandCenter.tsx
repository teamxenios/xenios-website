import { useMemo, useState } from "react";

export interface OperationsUiMetric {
  key: string;
  label: string;
  value: number;
  href: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
}

export interface OperationsExceptionRow {
  id: string;
  orderReference: string;
  kind: string;
  owner: string;
  age: string;
  severity: "normal" | "urgent" | "samuel_decision";
  href: string;
}

export function OperationsCommandCenter({
  metrics,
  exceptions,
  generatedAt,
  priorityHref,
  loading = false,
  error,
  onRetry,
}: {
  metrics: OperationsUiMetric[];
  exceptions: OperationsExceptionRow[];
  generatedAt: string;
  priorityHref: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [tone, setTone] = useState("all");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics.filter(
      (metric) =>
        (tone === "all" || metric.tone === tone) &&
        (!q || metric.label.toLowerCase().includes(q) || metric.key.toLowerCase().includes(q)),
    );
  }, [metrics, search, tone]);

  return (
    <main className="ops-page" data-testid="operations-command-center">
      <div className="ops-shell">
        <header className="ops-header">
          <div>
            <p className="ops-kicker">Xenios research / live operations</p>
            <h1 className="ops-title">Shared command center.</h1>
            <p className="ops-lead">
              Applications, money, fulfillment, partners, professional accounts, and delivery health—each count opens
              the queue that produced it.
            </p>
          </div>
          <div>
            <p className="ops-kicker">Last refreshed</p>
            <p className="body-s">{new Date(generatedAt).toLocaleString()}</p>
            <a href={priorityHref} className="ops-primary" style={{ marginTop: 12 }}>
              Open priority queue
            </a>
          </div>
        </header>

        {loading ? (
          <section className="ops-state" role="status" aria-live="polite">
            <p className="ops-kicker">Loading operations</p>
            <p>Building the current queue picture…</p>
          </section>
        ) : error ? (
          <section className="ops-state" role="alert">
            <p className="ops-kicker">Operations unavailable</p>
            <p>{error}</p>
            {onRetry && (
              <button type="button" className="ops-primary" onClick={onRetry}>
                Try again
              </button>
            )}
          </section>
        ) : (
          <>
            <div className="ops-toolbar" role="search">
              <label>
                <span className="ops-kicker">Search metrics</span>
                <input
                  className="ops-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Inventory, payouts, applications…"
                />
              </label>
              <label>
                <span className="ops-kicker">Filter urgency</span>
                <select className="ops-select" value={tone} onChange={(event) => setTone(event.target.value)}>
                  <option value="all">All queues</option>
                  <option value="danger">Needs action</option>
                  <option value="warning">Waiting</option>
                  <option value="success">Healthy</option>
                </select>
              </label>
            </div>

            {filtered.length ? (
              <section className="ops-metrics" aria-label="Operations metrics">
                {filtered.map((metric) => (
                  <a key={metric.key} className="ops-card-link" href={metric.href} aria-label={`${metric.label}: ${metric.value}`}>
                    <article className="ops-metric" data-tone={metric.tone}>
                      <p className="ops-metric-value">{metric.value}</p>
                      <p className="ops-metric-label">{metric.label} →</p>
                    </article>
                  </a>
                ))}
              </section>
            ) : (
              <section className="ops-state" role="status">
                <p>No queues match this filter.</p>
              </section>
            )}

            <section className="ops-section" aria-labelledby="exception-heading">
              <div className="ops-section-head">
                <div>
                  <p className="ops-kicker">Human decision queue</p>
                  <h2 id="exception-heading" className="ops-section-title">Exceptions needing an owner</h2>
                </div>
                <a href="/operations/mitch?queue=exceptions" className="ops-card-link">
                  View all exceptions →
                </a>
              </div>
              {exceptions.length ? (
                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <caption className="sr-only">Open fulfillment exceptions</caption>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Exception</th>
                        <th>Owner</th>
                        <th>Age</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.orderReference}</strong></td>
                          <td>{row.kind}</td>
                          <td>{row.owner}</td>
                          <td>{row.age}</td>
                          <td>
                            <span className="ops-status" data-tone={row.severity === "normal" ? "warning" : "danger"}>
                              {row.severity === "samuel_decision" ? "Samuel decision" : row.severity}
                            </span>
                          </td>
                          <td><a className="ops-card-link" href={row.href}>Open →</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ops-state"><p>No open exceptions. The queue is clear.</p></div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
