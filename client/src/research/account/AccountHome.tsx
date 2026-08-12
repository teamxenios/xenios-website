import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { AccountContextDto } from "@shared/research/account-identity";
import { PageIntro } from "../components";
import { getAccountContext } from "./api";

export default function AccountHome() {
  const [context, setContext] = useState<AccountContextDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getAccountContext().then((result) => {
      if (!alive) return;
      if (result.kind === "ok") setContext(result.data);
      else setError(result.message);
    });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <PageIntro eyebrow="Accounts" title="Your Xenios accounts." lead="Personal and organization access use one verified Supabase sign-in." />
      <main className="container-x pb-20">
        {!context && !error && <p className="body-s text-ink-mute" role="status">Loading account access…</p>}
        {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }}>{error}</p>}
        {context && (
          <div className="grid gap-6">
            <p className="body-s text-ink-mute">Signed in as {context.auth.email}</p>
            <div className="grid md:grid-cols-3 gap-4">
              {context.personal && <Link className="card" href="/research/member"><h2 className="body-m font-700">Personal account</h2><p className="body-s text-ink-2 mt-2">Profile, security, orders, invoices, and tracking.</p></Link>}
              {context.organizations.map((organization) => (
                <Link key={organization.id} className="card" href={`/research/account/organizations/${organization.id}`}>
                  <h2 className="body-m font-700">{organization.displayName}</h2>
                  <p className="body-s text-ink-2 mt-2">{organization.roles.join(" · ")}</p>
                </Link>
              ))}
              <Link className="card" href="/research/account/claim-history"><h2 className="body-m font-700">Claim prior history</h2><p className="body-s text-ink-2 mt-2">Attach a verified customer reference and its existing orders.</p></Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
