export interface ProfessionalUiAccount {
  id: string;
  accountType: "practitioner" | "professional";
  organizationName: string;
  programs: string[];
  state: string;
  agreementVersion: string | null;
}

export function ProfessionalAccounts({ accounts }: { accounts: ProfessionalUiAccount[] }) {
  return (
    <main className="ops-page" data-testid="professional-accounts">
      <div className="ops-shell">
        <header className="ops-header">
          <div>
            <p className="ops-kicker">Professional accounts</p>
            <h1 className="ops-title">Commercial relationships, kept separate.</h1>
            <p className="ops-lead">
              Wholesale, reseller, membership, directory, education, events, implementation, software, and future
              clinical partnerships each retain their own terms and review.
            </p>
          </div>
          <a className="ops-primary" href="?queue=applications">Review applications</a>
        </header>
        <section className="ops-section">
          {accounts.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <caption className="sr-only">Professional and practitioner accounts</caption>
                <thead><tr><th>Account</th><th>Type</th><th>Programs</th><th>Agreement</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td><strong>{account.organizationName}</strong></td>
                      <td>{account.accountType}</td>
                      <td>{account.programs.join(" · ")}</td>
                      <td>{account.agreementVersion ?? "Pending"}</td>
                      <td><span className="ops-status" data-tone={account.state === "active" ? "success" : "warning"}>{account.state}</span></td>
                      <td><a className="ops-card-link" href={`?account=${encodeURIComponent(account.id)}`}>Open →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-state">No professional applications or active accounts.</div>
          )}
        </section>
        <section className="ops-section ops-state" aria-label="Economics policy">
          <p className="ops-kicker">Policy boundary</p>
          <p>
            No default payment for prescriptions, patient referrals, diagnosis, clinical approval, or medication value.
          </p>
        </section>
      </div>
    </main>
  );
}
