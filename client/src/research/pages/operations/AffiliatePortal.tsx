export interface AffiliatePortalData {
  state: string;
  code: string | null;
  links: Array<{ id: string; url: string; campaign: string | null }>;
  campaigns: string[];
  metrics: {
    clicks: number;
    uniqueVisitors: number;
    qualifiedSignups: number;
    orders: number;
    conversionRate: number;
    eligibleRevenueCents: number;
    refundsCents: number;
    chargebacksCents: number;
  };
  commission: {
    pendingCents: number;
    approvedCents: number;
    payableCents: number;
    paidCents: number;
    reversedCents: number;
  };
  payoutHistory: Array<{ batchId: string; amountCents: number; paidAt: string; reference: string }>;
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function AffiliatePortal({ data }: { data: AffiliatePortalData }) {
  const metrics = [
    ["Clicks", data.metrics.clicks],
    ["Unique visitors", data.metrics.uniqueVisitors],
    ["Qualified signups", data.metrics.qualifiedSignups],
    ["Orders", data.metrics.orders],
    ["Conversion", `${(data.metrics.conversionRate * 100).toFixed(1)}%`],
    ["Eligible revenue", money(data.metrics.eligibleRevenueCents)],
    ["Refunds", money(data.metrics.refundsCents)],
    ["Chargebacks", money(data.metrics.chargebacksCents)],
    ["Pending commission", money(data.commission.pendingCents)],
    ["Approved", money(data.commission.approvedCents)],
    ["Payable", money(data.commission.payableCents)],
    ["Paid", money(data.commission.paidCents)],
    ["Reversed", money(data.commission.reversedCents)],
  ] as const;
  return (
    <main className="ops-page" data-testid="affiliate-portal">
      <div className="ops-shell">
        <header className="ops-header">
          <div>
            <p className="ops-kicker">Affiliate account / {data.state}</p>
            <h1 className="ops-title">Your channel, in numbers.</h1>
            <p className="ops-lead">Campaign performance and commission status—without customer identity.</p>
          </div>
          <button type="button" className="ops-primary">Create campaign link</button>
        </header>
        <section className="affiliate-summary ops-section">
          <div className="affiliate-hero">
            <p className="ops-kicker">Primary code</p>
            <p className="affiliate-code">{data.code ?? "Pending"}</p>
            <p className="ops-lead">{data.campaigns.length} active campaigns · {data.links.length} signed links</p>
          </div>
          <div className="ops-metric" data-tone="success">
            <p className="ops-kicker">Paid commission</p>
            <p className="ops-metric-value">{money(data.commission.paidCents)}</p>
            <p className="ops-metric-label">Provider-settled payouts only</p>
          </div>
        </section>
        <section className="ops-metrics ops-section" aria-label="Affiliate performance">
          {metrics.map(([label, value]) => (
            <article className="ops-metric" key={label}>
              <p className="ops-metric-value" style={{ fontSize: 32 }}>{value}</p>
              <p className="ops-metric-label">{label}</p>
            </article>
          ))}
        </section>
        <section className="ops-section" aria-labelledby="affiliate-links">
          <h2 id="affiliate-links" className="ops-section-title">Signed links</h2>
          {data.links.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Campaign</th><th>Link</th></tr></thead>
                <tbody>
                  {data.links.map((link) => (
                    <tr key={link.id}><td>{link.campaign ?? "General"}</td><td>{link.url}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="ops-state">No links yet.</div>}
        </section>
      </div>
    </main>
  );
}
